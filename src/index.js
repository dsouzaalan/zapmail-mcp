#!/usr/bin/env node
"use strict";

/*
 * Zapmail MCP server (NL-enabled)
 *
 * Key features
 * - Workspace + service-provider headers sent on *every* API call (with per-call override).
 * - Wallet-first purchase logic (auto-detects if wallet balance covers the order).
 * - Dynamic endpoint discovery from https://docs.zapmail.ai/llms.txt and per-slug doc fetch.
 * - Natural-language plan_and_execute tool (rules-based planner with optional LLM planner).
 * - Dry-run (planning only) vs execute modes, with step-by-step plan output.
 * - Robust retries, backoff, and 429/5xx handling.
 * - Built-in username/name/domain generators using your prompts.
 * - Tools for both high-level flows and each documented endpoint (dynamic tools).
 *
 * Notes
 * - API base: set ZAPMAIL_API_BASE (defaults to https://api.zapmail.ai/api)
 * - API key: set ZAPMAIL_API_KEY (or ZAPMAIL_API_TOKEN)
 * - Workspace: set ZAPMAIL_WORKSPACE_KEY
 * - Provider: set ZAPMAIL_SERVICE_PROVIDER = GOOGLE|MICROSOFT
 * - Optional OpenAI: OPENAI_API_KEY (only used by the LLM planner if enabled)
 */

import { stdin, stdout, stderr, env, argv } from "node:process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Handle command line arguments
if (argv.includes("--version") || argv.includes("-v")) {
  try {
    const packagePath = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "package.json"
    );
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
    console.log(packageJson.version);
    process.exit(0);
  } catch (error) {
    process.exit(0);
  }
}

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`
Zapmail MCP Server

A Model Context Protocol (MCP) server for the Zapmail API that provides natural language access to domain management, mailbox operations, and exports.

Usage:
  npx zapmail-mcp [options]

Options:
  --version, -v    Show version number
  --help, -h       Show this help message

Environment Variables:
  ZAPMAIL_API_KEY          Your Zapmail API key (required)
  ZAPMAIL_WORKSPACE_KEY    Default workspace ID (optional)
  ZAPMAIL_SERVICE_PROVIDER Email provider: GOOGLE or MICROSOFT (default: GOOGLE)
  ZAPMAIL_LOG_LEVEL        Logging level: DEBUG, INFO, WARN, ERROR (default: INFO)
  OPENAI_API_KEY           OpenAI API key for enhanced NLP (optional)

For more information, visit: https://github.com/dsouzaalan/zapmail-mcp
`);
  process.exit(0);
}
import { setTimeout as sleep } from "node:timers/promises";
import crypto from "node:crypto";

// We use global fetch in Node 18+

// ---------------------------------------------------------------------------
// Configuration and global context
// ---------------------------------------------------------------------------

const API_BASE = (env.ZAPMAIL_API_BASE || "https://api.zapmail.ai/api").trim();

function getApiKey() {
  const key = env.ZAPMAIL_API_KEY || env.ZAPMAIL_API_TOKEN;
  return key ? key.trim() : null;
}

const CONTEXT = {
  workspaceKey: (env.ZAPMAIL_WORKSPACE_KEY || "").trim() || null,
  serviceProvider: (env.ZAPMAIL_SERVICE_PROVIDER || "GOOGLE")
    .trim()
    .toUpperCase(),
};

const FEATURE_FLAGS = {
  llmPlanner: !!env.OPENAI_API_KEY, // If OpenAI key exists, planner can use LLM. Otherwise uses rules.
};

// Enhanced configuration with defaults
const CONFIG = {
  logLevel: (env.ZAPMAIL_LOG_LEVEL || "INFO").toUpperCase(),
  maxRetries: parseInt(env.ZAPMAIL_MAX_RETRIES || "3", 10),
  timeoutMs: parseInt(env.ZAPMAIL_TIMEOUT_MS || "30000", 10),
  enableCaching: env.ZAPMAIL_ENABLE_CACHE !== "false",
  enableMetrics: env.ZAPMAIL_ENABLE_METRICS !== "false",
  rateLimitDelay: parseInt(env.ZAPMAIL_RATE_LIMIT_DELAY || "1000", 10),
};

// ---------------------------------------------------------------------------
// Enhanced Logging System
// ---------------------------------------------------------------------------

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

class Logger {
  constructor(level = "INFO") {
    this.level = LOG_LEVELS[level] || LOG_LEVELS.INFO;
  }

  log(level, message, data = null) {
    if (LOG_LEVELS[level] >= this.level) {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        level,
        message,
        ...(data && { data }),
      };
      stderr.write(JSON.stringify(logEntry) + "\n");
    }
  }

  debug(message, data) {
    this.log("DEBUG", message, data);
  }
  info(message, data) {
    this.log("INFO", message, data);
  }
  warn(message, data) {
    this.log("WARN", message, data);
  }
  error(message, data) {
    this.log("ERROR", message, data);
  }
}

const logger = new Logger(CONFIG.logLevel);

// ---------------------------------------------------------------------------
// Enhanced Error Handling
// ---------------------------------------------------------------------------

class ZapmailError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = "ZapmailError";
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

class ValidationError extends ZapmailError {
  constructor(message, field, value) {
    super(message, "VALIDATION_ERROR", { field, value });
    this.name = "ValidationError";
  }
}

class ApiError extends ZapmailError {
  constructor(message, status, response) {
    super(message, "API_ERROR", { status, response });
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Enhanced Request/Response Validation
// ---------------------------------------------------------------------------

function validateRequired(value, fieldName) {
  if (value === null || value === undefined || value === "") {
    throw new ValidationError(`${fieldName} is required`, fieldName, value);
  }
  return value;
}

function validateString(value, fieldName, maxLength = 1000) {
  const validated = validateRequired(value, fieldName);
  if (typeof validated !== "string") {
    throw new ValidationError(
      `${fieldName} must be a string`,
      fieldName,
      validated
    );
  }
  if (validated.length > maxLength) {
    throw new ValidationError(
      `${fieldName} exceeds maximum length of ${maxLength}`,
      fieldName,
      validated
    );
  }
  return validated;
}

function validateArray(value, fieldName, minLength = 0) {
  if (!Array.isArray(value)) {
    throw new ValidationError(
      `${fieldName} must be an array`,
      fieldName,
      value
    );
  }
  if (value.length < minLength) {
    throw new ValidationError(
      `${fieldName} must have at least ${minLength} items`,
      fieldName,
      value
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Enhanced Metrics and Monitoring
// ---------------------------------------------------------------------------

class Metrics {
  constructor() {
    this.counters = new Map();
    this.timers = new Map();
    this.histograms = new Map();
  }

  increment(counter, value = 1) {
    this.counters.set(counter, (this.counters.get(counter) || 0) + value);
  }

  recordTimer(timer, duration) {
    if (!this.timers.has(timer)) {
      this.timers.set(timer, []);
    }
    this.timers.get(timer).push(duration);
  }

  recordHistogram(histogram, value) {
    if (!this.histograms.has(histogram)) {
      this.histograms.set(histogram, []);
    }
    this.histograms.get(histogram).push(value);
  }

  getStats() {
    const stats = {
      counters: Object.fromEntries(this.counters),
      timers: {},
      histograms: {},
    };

    for (const [timer, values] of this.timers) {
      if (values.length > 0) {
        stats.timers[timer] = {
          count: values.length,
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
        };
      }
    }

    for (const [histogram, values] of this.histograms) {
      if (values.length > 0) {
        stats.histograms[histogram] = {
          count: values.length,
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
        };
      }
    }

    return stats;
  }
}

const metrics = CONFIG.enableMetrics ? new Metrics() : null;

// ---------------------------------------------------------------------------
// Enhanced Caching System
// ---------------------------------------------------------------------------

class Cache {
  constructor(maxSize = 1000, ttl = 300000) {
    // 5 minutes default TTL
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.cache = new Map();
  }

  set(key, value, ttl = this.ttl) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expires: Date.now() + ttl,
    });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

const cache = CONFIG.enableCaching ? new Cache() : null;

// ---------------------------------------------------------------------------
// Enhanced Rate Limiting
// ---------------------------------------------------------------------------

class RateLimiter {
  constructor(maxRequests = 10, windowMs = 60000) {
    // 10 requests per minute
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
  }

  async checkLimit(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }

    const requests = this.requests.get(key);
    const recentRequests = requests.filter((time) => time > windowStart);

    if (recentRequests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...recentRequests);
      const waitTime = this.windowMs - (now - oldestRequest);
      await sleep(waitTime);
    }

    recentRequests.push(now);
    this.requests.set(key, recentRequests);
  }
}

const rateLimiter = new RateLimiter();

// ---------------------------------------------------------------------------
// Export System Documentation and Flows
// ---------------------------------------------------------------------------

// Export system configuration and documentation
const EXPORT_SYSTEM = {
  // Supported third-party applications
  supportedApps: {
    REACHINBOX: {
      name: "Reachinbox",
      description: "Email outreach and cold email platform",
      requiredFields: ["email", "password"],
      exportFormat: "direct_integration",
      documentation: "https://reachinbox.com/docs",
      setupSteps: [
        "1. Create a Reachinbox account",
        "2. Get your login credentials",
        "3. Add credentials to Zapmail",
        "4. Export mailboxes directly to Reachinbox",
      ],
    },
    INSTANTLY: {
      name: "Instantly",
      description: "Cold email automation platform",
      requiredFields: ["email", "password"],
      exportFormat: "direct_integration",
      documentation: "https://instantly.ai/docs",
      setupSteps: [
        "1. Create an Instantly account",
        "2. Get your login credentials",
        "3. Add credentials to Zapmail",
        "4. Export mailboxes directly to Instantly",
      ],
    },
    SMARTLEAD: {
      name: "Smartlead",
      description: "Email automation and outreach platform",
      requiredFields: ["email", "password"],
      exportFormat: "direct_integration",
      documentation: "https://smartlead.ai/docs",
      setupSteps: [
        "1. Create a Smartlead account",
        "2. Get your login credentials",
        "3. Add credentials to Zapmail",
        "4. Export mailboxes directly to Smartlead",
      ],
    },
    REPLY_IO: {
      name: "Reply.io",
      description: "Sales engagement platform",
      requiredFields: ["email", "password"],
      exportFormat: "direct_integration",
      documentation: "https://reply.io/docs",
      setupSteps: [
        "1. Create a Reply.io account",
        "2. Get your login credentials",
        "3. Add credentials to Zapmail",
        "4. Export mailboxes directly to Reply.io",
      ],
    },
    MANUAL: {
      name: "Manual Export",
      description: "Export as CSV/JSON for manual import",
      requiredFields: [],
      exportFormat: "file_download",
      documentation: "Manual import to any platform",
      setupSteps: [
        "1. Export mailboxes as CSV/JSON",
        "2. Download the export file",
        "3. Import manually into your preferred platform",
      ],
    },
  },

  // Export flow documentation
  exportFlows: {
    // Flow 1: Direct integration with third-party app
    directIntegration: {
      name: "Direct Integration Export",
      description: "Export mailboxes directly to a third-party application",
      steps: [
        {
          step: 1,
          action: "add_third_party_account",
          description: "Add third-party account credentials",
          required: ["email", "password", "app"],
          example: {
            email: "user@reachinbox.com",
            password: "your_password",
            app: "REACHINBOX",
          },
        },
        {
          step: 2,
          action: "export_mailboxes",
          description: "Export mailboxes to the connected account",
          required: ["apps"],
          optional: ["ids", "excludeIds", "tagIds", "contains", "status"],
          example: {
            apps: ["REACHINBOX"],
            status: "ACTIVE",
          },
        },
      ],
      expectedOutcome:
        "Mailboxes exported directly to the third-party application",
    },

    // Flow 2: Manual export for file download
    manualExport: {
      name: "Manual Export",
      description: "Export mailboxes as files for manual import",
      steps: [
        {
          step: 1,
          action: "export_mailboxes",
          description: "Export mailboxes as CSV/JSON files",
          required: ["apps"],
          optional: ["ids", "excludeIds", "tagIds", "contains", "status"],
          example: {
            apps: ["MANUAL"],
            status: "ACTIVE",
          },
        },
      ],
      expectedOutcome: "CSV/JSON file download for manual import",
    },
  },

  // Common export scenarios
  scenarios: {
    exportAllToReachinbox: {
      name: "Export All Mailboxes to Reachinbox",
      description:
        "Export all active mailboxes to Reachinbox for email outreach",
      flow: "directIntegration",
      requirements: {
        reachinboxEmail: "Your Reachinbox account email",
        reachinboxPassword: "Your Reachinbox account password",
      },
      steps: [
        "1. Add Reachinbox credentials using add_third_party_account",
        "2. Export all mailboxes using export_mailboxes with apps: ['REACHINBOX']",
        "3. Mailboxes will be automatically imported into your Reachinbox account",
      ],
      example: {
        step1: {
          tool: "add_third_party_account",
          input: {
            email: "your_email@reachinbox.com",
            password: "your_password",
            app: "REACHINBOX",
          },
        },
        step2: {
          tool: "export_mailboxes",
          input: {
            apps: ["REACHINBOX"],
            status: "ACTIVE",
          },
        },
      },
    },

    exportSpecificMailboxes: {
      name: "Export Specific Mailboxes",
      description: "Export only selected mailboxes to a third-party app",
      flow: "directIntegration",
      requirements: {
        thirdPartyCredentials: "Valid credentials for the target platform",
        mailboxIds: "List of mailbox IDs to export",
      },
      steps: [
        "1. Add third-party credentials using add_third_party_account",
        "2. Export specific mailboxes using export_mailboxes with ids parameter",
        "3. Only selected mailboxes will be exported",
      ],
      example: {
        step1: {
          tool: "add_third_party_account",
          input: {
            email: "user@instantly.ai",
            password: "password",
            app: "INSTANTLY",
          },
        },
        step2: {
          tool: "export_mailboxes",
          input: {
            apps: ["INSTANTLY"],
            ids: ["mailbox-id-1", "mailbox-id-2", "mailbox-id-3"],
          },
        },
      },
    },

    exportByDomain: {
      name: "Export Mailboxes by Domain",
      description: "Export all mailboxes from specific domains",
      flow: "directIntegration",
      requirements: {
        thirdPartyCredentials: "Valid credentials for the target platform",
        domainFilter: "Domain filter criteria",
      },
      steps: [
        "1. Add third-party credentials using add_third_party_account",
        "2. Export mailboxes using export_mailboxes with contains parameter",
        "3. Only mailboxes matching the domain criteria will be exported",
      ],
      example: {
        step1: {
          tool: "add_third_party_account",
          input: {
            email: "user@smartlead.ai",
            password: "password",
            app: "SMARTLEAD",
          },
        },
        step2: {
          tool: "export_mailboxes",
          input: {
            apps: ["SMARTLEAD"],
            contains: "leadconnectio.com",
          },
        },
      },
    },

    manualCSVExport: {
      name: "Manual CSV Export",
      description: "Export mailboxes as CSV for manual import to any platform",
      flow: "manualExport",
      requirements: {},
      steps: [
        "1. Export mailboxes using export_mailboxes with apps: ['MANUAL']",
        "2. Download the CSV file",
        "3. Import manually into your preferred platform",
      ],
      example: {
        step1: {
          tool: "export_mailboxes",
          input: {
            apps: ["MANUAL"],
            status: "ACTIVE",
          },
        },
      },
    },
  },

  // Error handling and troubleshooting
  troubleshooting: {
    invalidCredentials: {
      error: "Invalid credentials, failed to authenticate",
      cause: "Incorrect email or password for the third-party account",
      solution: "Verify your credentials and try again",
      prevention: "Double-check email and password before adding account",
    },
    accountNotFound: {
      error: "Account not found",
      cause: "Third-party account doesn't exist or is inactive",
      solution: "Create an account on the third-party platform first",
      prevention:
        "Ensure account exists and is active before adding to Zapmail",
    },
    exportFailed: {
      error: "Export failed",
      cause: "Network issues, API limits, or platform-specific errors",
      solution: "Check network connection, try again later, or contact support",
      prevention: "Ensure stable internet connection and valid account status",
    },
    noMailboxesFound: {
      error: "No mailboxes found for export",
      cause: "No mailboxes match the specified criteria",
      solution: "Check mailbox status and filter criteria",
      prevention: "Verify mailbox existence and filter parameters",
    },
  },

  // Best practices
  bestPractices: [
    "Always verify third-party account credentials before adding them",
    "Use specific filters (ids, contains, status) to export only needed mailboxes",
    "Export in batches for large numbers of mailboxes",
    "Keep third-party credentials secure and up-to-date",
    "Test export with a small subset before full export",
    "Monitor export status and verify successful import in target platform",
    "Use MANUAL export for platforms not directly supported",
    "Regularly update third-party account credentials",
  ],
};

// Export helper functions
const EXPORT_HELPERS = {
  // Validate export request
  validateExportRequest(request) {
    const { apps, email, password, app } = request;

    if (!apps || !Array.isArray(apps) || apps.length === 0) {
      throw new ValidationError(
        "apps array is required and must not be empty",
        "apps",
        apps
      );
    }

    // Validate app names
    for (const appName of apps) {
      if (!EXPORT_SYSTEM.supportedApps[appName]) {
        throw new ValidationError(`Unsupported app: ${appName}`, "apps", apps);
      }
    }

    // For direct integration, validate credentials
    if (apps.some((app) => app !== "MANUAL")) {
      if (!email || !password || !app) {
        throw new ValidationError(
          "email, password, and app are required for direct integration",
          "credentials",
          { email, password, app }
        );
      }

      if (!EXPORT_SYSTEM.supportedApps[app]) {
        throw new ValidationError(`Unsupported app: ${app}`, "app", app);
      }
    }

    return true;
  },

  // Get export scenario by name
  getScenario(scenarioName) {
    return EXPORT_SYSTEM.scenarios[scenarioName] || null;
  },

  // Get troubleshooting info by error
  getTroubleshooting(errorMessage) {
    for (const [key, info] of Object.entries(EXPORT_SYSTEM.troubleshooting)) {
      if (errorMessage.includes(info.error)) {
        return info;
      }
    }
    return null;
  },

  // Generate export instructions
  generateInstructions(scenarioName, customParams = {}) {
    const scenario = this.getScenario(scenarioName);
    if (!scenario) {
      throw new Error(`Unknown scenario: ${scenarioName}`);
    }

    let instructions = {
      scenario: scenario.name,
      description: scenario.description,
      requirements: scenario.requirements,
      steps: scenario.steps,
      example: scenario.example,
    };

    // Customize with provided parameters
    if (customParams.credentials) {
      instructions.example.step1.input = {
        ...instructions.example.step1.input,
        ...customParams.credentials,
      };
    }

    if (customParams.filters) {
      instructions.example.step2.input = {
        ...instructions.example.step2.input,
        ...customParams.filters,
      };
    }

    return instructions;
  },
};

// ---------------------------------------------------------------------------
// Comprehensive API Endpoint Documentation and Guidance System
// ---------------------------------------------------------------------------

// API endpoint categories and documentation
const API_ENDPOINT_SYSTEM = {
  // Workspace Management
  workspace: {
    name: "Workspace Management",
    description:
      "Manage workspaces, switch contexts, and view workspace information",
    endpoints: {
      listWorkspaces: {
        path: "/v2/workspaces",
        method: "GET",
        description: "List all workspaces accessible to the user",
        parameters: {},
        response: {
          success: "Array of workspace objects with id, name, status, etc.",
          example: [
            { id: "ws_123", name: "Prewarm - August", status: "ACTIVE" },
            { id: "ws_456", name: "Main Workspace", status: "ACTIVE" },
          ],
        },
        useCases: [
          "View all available workspaces",
          "Switch between different projects",
          "Check workspace status and configuration",
        ],
        bestPractices: [
          "Use this to identify the correct workspace before operations",
          "Check workspace status before performing operations",
          "Note workspace IDs for programmatic access",
        ],
      },
    },
    commonScenarios: {
      switchWorkspace: {
        name: "Switch to Different Workspace",
        description: "Change the active workspace context",
        steps: [
          "1. List all workspaces to identify the target workspace",
          "2. Set the workspace key in environment or context",
          "3. Verify the workspace switch by listing domains or mailboxes",
        ],
        example: {
          step1: "GET /v2/workspaces",
          step2: "Set ZAPMAIL_WORKSPACE_KEY=target_workspace_id",
          step3: "GET /v2/domains (to verify context)",
        },
      },
    },
  },

  // Domain Management
  domains: {
    name: "Domain Management",
    description:
      "Manage domains, check availability, purchase, and configure domains",
    endpoints: {
      listDomains: {
        path: "/v2/domains",
        method: "GET",
        description: "List all domains in the current workspace",
        parameters: {
          query: {
            status: "Filter by domain status (ACTIVE, SUSPENDED, etc.)",
            contains: "Filter domains containing specific text",
          },
        },
        response: {
          success:
            "Array of domain objects with id, name, status, mailbox count, etc.",
          example: [
            {
              id: "dom_123",
              name: "leadconnectio.com",
              status: "ACTIVE",
              mailboxCount: 5,
            },
            {
              id: "dom_456",
              name: "outreachpro.com",
              status: "ACTIVE",
              mailboxCount: 0,
            },
          ],
        },
        useCases: [
          "View all domains in workspace",
          "Find domains with zero mailboxes for new mailbox creation",
          "Check domain status and health",
          "Identify domains for specific campaigns",
        ],
        bestPractices: [
          "Use status filters to focus on active domains",
          "Check mailbox count to identify empty domains",
          "Use contains filter to find specific domain patterns",
        ],
      },

      checkAvailability: {
        path: "/v2/domains/available",
        method: "POST",
        description: "Check domain availability for registration",
        parameters: {
          body: {
            domainName: "Domain name to check (required)",
            years: "Registration period in years (default: 1)",
          },
        },
        response: {
          success: "Domain availability status with pricing information",
          example: {
            domainName: "example.com",
            available: true,
            price: 12.99,
            currency: "USD",
          },
        },
        useCases: [
          "Check if a domain is available for purchase",
          "Get pricing information before purchase",
          "Validate domain names before registration",
        ],
        bestPractices: [
          "Check multiple domains in batch for efficiency",
          "Verify domain name format before checking",
          "Consider pricing when planning purchases",
        ],
      },

      purchaseDomains: {
        path: "/v2/domains/buy",
        method: "POST",
        description: "Purchase domains using wallet or payment method",
        parameters: {
          body: {
            domains: "Array of domain names to purchase (required)",
            years: "Registration period in years (default: 1)",
            useWallet: "Use wallet balance if available (default: true)",
          },
        },
        response: {
          success: "Purchase confirmation with domain details",
          example: {
            purchaseId: "pur_123",
            domains: ["example.com", "test.com"],
            totalCost: 25.98,
            paymentMethod: "wallet",
          },
        },
        useCases: [
          "Purchase new domains for campaigns",
          "Register domains in bulk",
          "Use wallet balance for purchases",
        ],
        bestPractices: [
          "Check wallet balance before large purchases",
          "Verify domain availability before purchase",
          "Use appropriate registration periods",
          "Consider bulk discounts for multiple domains",
        ],
      },

      // Additional domain endpoints from official documentation
      listAssignableDomains: {
        path: "/v2/domains/assignable",
        method: "GET",
        description:
          "List domains that can be assigned to the current workspace",
        parameters: {},
        response: {
          success: "Array of assignable domain objects",
          example: [
            { id: "dom_123", name: "example.com", status: "AVAILABLE" },
          ],
        },
        useCases: [
          "Find domains available for assignment",
          "Check domain assignment status",
          "Prepare domain assignments",
        ],
        bestPractices: [
          "Check domain status before assignment",
          "Verify workspace permissions",
          "Plan domain assignments strategically",
        ],
      },

      addDmarcRecord: {
        path: "/v2/domains/{domainId}/dmarc",
        method: "POST",
        description: "Add DMARC record to domain for email authentication",
        parameters: {
          path: {
            domainId: "Domain ID to add DMARC record to (required)",
          },
          body: {
            dmarcRecord: "DMARC record content (required)",
            policy: "DMARC policy (none, quarantine, reject)",
          },
        },
        response: {
          success: "DMARC record addition confirmation",
          example: {
            domainId: "dom_123",
            dmarcStatus: "ACTIVE",
            policy: "quarantine",
          },
        },
        useCases: [
          "Improve email deliverability",
          "Configure email authentication",
          "Set up DMARC policies",
        ],
        bestPractices: [
          "Start with 'none' policy for monitoring",
          "Gradually increase policy strictness",
          "Monitor DMARC reports regularly",
        ],
      },

      addDomainForwarding: {
        path: "/v2/domains/{domainId}/forwarding",
        method: "POST",
        description: "Add domain forwarding rules",
        parameters: {
          path: {
            domainId: "Domain ID to add forwarding to (required)",
          },
          body: {
            forwardingRules: "Array of forwarding rules (required)",
            targetEmail: "Target email address for forwarding",
          },
        },
        response: {
          success: "Domain forwarding configuration confirmation",
          example: {
            domainId: "dom_123",
            forwardingStatus: "ACTIVE",
            rulesCount: 3,
          },
        },
        useCases: [
          "Set up email forwarding",
          "Configure catch-all forwarding",
          "Route emails to specific addresses",
        ],
        bestPractices: [
          "Test forwarding rules before activation",
          "Monitor forwarding performance",
          "Keep forwarding rules simple",
        ],
      },

      getNameservers: {
        path: "/v2/domains/{domainId}/nameservers",
        method: "GET",
        description: "Get nameserver information for domain connection",
        parameters: {
          path: {
            domainId: "Domain ID to get nameservers for (required)",
          },
        },
        response: {
          success: "Nameserver configuration information",
          example: {
            domainId: "dom_123",
            nameservers: ["ns1.zapmail.ai", "ns2.zapmail.ai"],
            connectionStatus: "PENDING",
          },
        },
        useCases: [
          "Get nameservers for domain setup",
          "Configure domain DNS settings",
          "Verify domain connection status",
        ],
        bestPractices: [
          "Use provided nameservers exactly",
          "Wait for DNS propagation",
          "Verify connection after setup",
        ],
      },

      verifyNameserverPropagation: {
        path: "/v2/domains/{domainId}/nameservers/verify",
        method: "POST",
        description: "Verify nameserver propagation and domain connection",
        parameters: {
          path: {
            domainId: "Domain ID to verify (required)",
          },
        },
        response: {
          success: "Nameserver verification results",
          example: {
            domainId: "dom_123",
            propagationStatus: "COMPLETED",
            nameserversVerified: true,
            connectionReady: true,
          },
        },
        useCases: [
          "Verify domain connection setup",
          "Check DNS propagation status",
          "Confirm domain readiness",
        ],
        bestPractices: [
          "Wait 24-48 hours for full propagation",
          "Check multiple DNS servers",
          "Verify before creating mailboxes",
        ],
      },

      connectDomain: {
        path: "/v2/domains/{domainId}/connect",
        method: "POST",
        description: "Connect domain with Zapmail (new method)",
        parameters: {
          path: {
            domainId: "Domain ID to connect (required)",
          },
          body: {
            connectionType: "Type of connection (required)",
            settings: "Connection-specific settings",
          },
        },
        response: {
          success: "Domain connection confirmation",
          example: {
            domainId: "dom_123",
            connectionStatus: "CONNECTED",
            connectionType: "STANDARD",
          },
        },
        useCases: [
          "Connect new domains to Zapmail",
          "Set up domain for email services",
          "Configure domain integration",
        ],
        bestPractices: [
          "Verify domain ownership first",
          "Use correct connection type",
          "Test connection after setup",
        ],
      },

      enableEmailForwarding: {
        path: "/v2/domains/{domainId}/forwarding/enable",
        method: "POST",
        description: "Enable email forwarding for domain",
        parameters: {
          path: {
            domainId: "Domain ID to enable forwarding for (required)",
          },
          body: {
            forwardingConfig: "Email forwarding configuration",
          },
        },
        response: {
          success: "Email forwarding activation confirmation",
          example: {
            domainId: "dom_123",
            forwardingEnabled: true,
            config: "catch-all",
          },
        },
        useCases: [
          "Enable catch-all email forwarding",
          "Set up email routing",
          "Configure domain email handling",
        ],
        bestPractices: [
          "Configure forwarding rules carefully",
          "Monitor forwarding performance",
          "Test forwarding functionality",
        ],
      },

      removeEmailForwarding: {
        path: "/v2/domains/{domainId}/forwarding/disable",
        method: "POST",
        description: "Remove email forwarding from domain",
        parameters: {
          path: {
            domainId: "Domain ID to remove forwarding from (required)",
          },
        },
        response: {
          success: "Email forwarding removal confirmation",
          example: {
            domainId: "dom_123",
            forwardingEnabled: false,
            removedAt: "2024-01-15T10:30:00Z",
          },
        },
        useCases: [
          "Disable email forwarding",
          "Remove forwarding rules",
          "Clean up domain configuration",
        ],
        bestPractices: [
          "Verify no active mailboxes depend on forwarding",
          "Backup forwarding configuration",
          "Test domain functionality after removal",
        ],
      },

      enableCatchAll: {
        path: "/v2/domains/{domainId}/catchall/enable",
        method: "POST",
        description: "Enable catch-all email handling for domain",
        parameters: {
          path: {
            domainId: "Domain ID to enable catch-all for (required)",
          },
          body: {
            catchAllEmail: "Email address to receive catch-all emails",
          },
        },
        response: {
          success: "Catch-all activation confirmation",
          example: {
            domainId: "dom_123",
            catchAllEnabled: true,
            catchAllEmail: "admin@domain.com",
          },
        },
        useCases: [
          "Capture all emails sent to domain",
          "Set up email monitoring",
          "Handle unknown email addresses",
        ],
        bestPractices: [
          "Use dedicated email for catch-all",
          "Monitor catch-all email volume",
          "Configure spam filtering",
        ],
      },

      removeCatchAll: {
        path: "/v2/domains/{domainId}/catchall/disable",
        method: "POST",
        description: "Remove catch-all email handling from domain",
        parameters: {
          path: {
            domainId: "Domain ID to remove catch-all from (required)",
          },
        },
        response: {
          success: "Catch-all removal confirmation",
          example: {
            domainId: "dom_123",
            catchAllEnabled: false,
            removedAt: "2024-01-15T10:30:00Z",
          },
        },
        useCases: [
          "Disable catch-all email handling",
          "Clean up domain configuration",
          "Improve email security",
        ],
        bestPractices: [
          "Verify no critical emails depend on catch-all",
          "Set up proper email routing",
          "Test domain functionality after removal",
        ],
      },

      checkDnsRecords: {
        path: "/v2/domains/{domainId}/dns/check",
        method: "GET",
        description: "Check DNS records for domain",
        parameters: {
          path: {
            domainId: "Domain ID to check DNS for (required)",
          },
        },
        response: {
          success: "DNS records and configuration status",
          example: {
            domainId: "dom_123",
            dnsRecords: [
              { type: "MX", value: "mail.zapmail.ai", priority: 10 },
              { type: "TXT", value: "v=spf1 include:zapmail.ai ~all" },
            ],
            status: "VALID",
          },
        },
        useCases: [
          "Verify DNS configuration",
          "Check email authentication records",
          "Debug domain setup issues",
        ],
        bestPractices: [
          "Regularly check DNS records",
          "Verify all required records exist",
          "Monitor DNS propagation",
        ],
      },

      removeUnusedDomains: {
        path: "/v2/domains/unused/remove",
        method: "POST",
        description: "Remove unused domains from workspace",
        parameters: {
          body: {
            domainIds: "Array of domain IDs to remove (required)",
            force:
              "Force removal even if domains have mailboxes (default: false)",
          },
        },
        response: {
          success: "Domain removal confirmation",
          example: {
            removedDomains: ["dom_123", "dom_456"],
            removedCount: 2,
            status: "COMPLETED",
          },
        },
        useCases: [
          "Clean up unused domains",
          "Remove test domains",
          "Optimize workspace organization",
        ],
        bestPractices: [
          "Verify domains are truly unused",
          "Backup domain configuration",
          "Check for dependent resources",
        ],
      },

      getDomainPurchaseLink: {
        path: "/v2/domains/purchase-link",
        method: "POST",
        description: "Get payment link for domain purchase",
        parameters: {
          body: {
            domains: "Array of domain names to purchase (required)",
            years: "Registration period in years (default: 1)",
          },
        },
        response: {
          success: "Payment link for domain purchase",
          example: {
            purchaseLink: "https://checkout.zapmail.ai/pay/abc123",
            domains: ["example.com", "test.com"],
            totalCost: 25.98,
            expiresAt: "2024-01-16T10:30:00Z",
          },
        },
        useCases: [
          "Generate payment links for domain purchases",
          "Share purchase links with team members",
          "Process domain purchases externally",
        ],
        bestPractices: [
          "Use secure payment links",
          "Set appropriate expiration times",
          "Verify payment completion",
        ],
      },

      getDomainConnectionRequests: {
        path: "/v2/domains/connection-requests",
        method: "GET",
        description: "Get pending domain connection requests",
        parameters: {},
        response: {
          success: "Array of pending connection requests",
          example: [
            {
              id: "req_123",
              domain: "example.com",
              status: "PENDING",
              requestedAt: "2024-01-15T10:30:00Z",
            },
          ],
        },
        useCases: [
          "View pending domain connections",
          "Manage connection requests",
          "Track domain setup progress",
        ],
        bestPractices: [
          "Review requests regularly",
          "Verify domain ownership",
          "Process requests promptly",
        ],
      },

      removeDomainConnectionRequests: {
        path: "/v2/domains/connection-requests/{requestId}",
        method: "DELETE",
        description: "Remove domain connection request",
        parameters: {
          path: {
            requestId: "Connection request ID to remove (required)",
          },
        },
        response: {
          success: "Connection request removal confirmation",
          example: {
            requestId: "req_123",
            status: "REMOVED",
            removedAt: "2024-01-15T10:30:00Z",
          },
        },
        useCases: [
          "Cancel pending connection requests",
          "Clean up invalid requests",
          "Manage connection queue",
        ],
        bestPractices: [
          "Verify request details before removal",
          "Document removal reasons",
          "Notify relevant parties",
        ],
      },

      addGoogleClientId: {
        path: "/v2/domains/{domainId}/google-client-id",
        method: "POST",
        description: "Add Google Client ID to domain for OAuth integration",
        parameters: {
          path: {
            domainId: "Domain ID to add Google Client ID to (required)",
          },
          body: {
            clientId: "Google OAuth Client ID (required)",
            clientSecret: "Google OAuth Client Secret (required)",
          },
        },
        response: {
          success: "Google Client ID addition confirmation",
          example: {
            domainId: "dom_123",
            googleClientId: "123456789.apps.googleusercontent.com",
            status: "ACTIVE",
          },
        },
        useCases: [
          "Set up Google OAuth for domain",
          "Configure Google Workspace integration",
          "Enable Google authentication",
        ],
        bestPractices: [
          "Use secure client credentials",
          "Verify domain ownership",
          "Test OAuth integration",
        ],
      },
    },
    commonScenarios: {
      bulkDomainPurchase: {
        name: "Bulk Domain Purchase",
        description: "Purchase multiple domains efficiently",
        steps: [
          "1. Check wallet balance",
          "2. Check availability for all target domains",
          "3. Purchase domains using wallet if sufficient balance",
          "4. Verify successful registration",
        ],
        example: {
          step1: "GET /v2/wallet/balance",
          step2: "POST /v2/domains/available (for each domain)",
          step3: "POST /v2/domains/buy",
          step4: "GET /v2/domains (to verify)",
        },
      },

      findEmptyDomains: {
        name: "Find Domains for Mailbox Creation",
        description:
          "Identify domains with zero mailboxes for new mailbox creation",
        steps: [
          "1. List all domains in workspace",
          "2. Filter domains with mailboxCount: 0",
          "3. Use these domains for mailbox creation",
        ],
        example: {
          step1: "GET /v2/domains",
          step2: "Filter results where mailboxCount === 0",
          step3: "Use domain IDs for mailbox creation",
        },
      },
    },
  },

  // Mailbox Management
  mailboxes: {
    name: "Mailbox Management",
    description: "Create, manage, and configure mailboxes",
    endpoints: {
      listMailboxes: {
        path: "/v2/mailboxes",
        method: "GET",
        description: "List all mailboxes in the current workspace",
        parameters: {
          query: {
            status: "Filter by mailbox status (ACTIVE, SUSPENDED, etc.)",
            domainId: "Filter by specific domain",
            contains: "Filter mailboxes containing specific text",
          },
        },
        response: {
          success:
            "Array of mailbox objects with id, email, status, domain, etc.",
          example: [
            {
              id: "mb_123",
              email: "john@leadconnectio.com",
              status: "ACTIVE",
              domainId: "dom_123",
            },
            {
              id: "mb_456",
              email: "sarah@outreachpro.com",
              status: "ACTIVE",
              domainId: "dom_456",
            },
          ],
        },
        useCases: [
          "View all mailboxes in workspace",
          "Find mailboxes for specific domains",
          "Check mailbox status and health",
          "Identify mailboxes for export or management",
        ],
        bestPractices: [
          "Use status filters to focus on active mailboxes",
          "Use domain filters to organize by domain",
          "Use contains filter to find specific patterns",
        ],
      },

      createMailboxes: {
        path: "/v2/mailboxes",
        method: "POST",
        description: "Create new mailboxes on specified domains",
        parameters: {
          body: {
            mailboxData: "Array of mailbox creation objects (required)",
            domainId:
              "Domain ID to create mailboxes on (if not in mailboxData)",
            count: "Number of mailboxes to create (if not in mailboxData)",
          },
        },
        response: {
          success: "Array of created mailbox objects",
          example: [
            { id: "mb_789", email: "user1@domain.com", status: "ACTIVE" },
            { id: "mb_790", email: "user2@domain.com", status: "ACTIVE" },
          ],
        },
        useCases: [
          "Create mailboxes for new campaigns",
          "Set up mailboxes on empty domains",
          "Bulk mailbox creation for outreach",
        ],
        bestPractices: [
          "Create mailboxes on domains with zero existing mailboxes",
          "Use meaningful usernames for better organization",
          "Consider mailbox limits per domain",
          "Verify domain status before creation",
        ],
      },

      updateMailbox: {
        path: "/v2/mailboxes/{mailboxId}",
        method: "PUT",
        description: "Update mailbox details and configuration",
        parameters: {
          path: {
            mailboxId: "ID of the mailbox to update (required)",
          },
          body: {
            firstName: "First name for the mailbox",
            lastName: "Last name for the mailbox",
            username: "Username for the mailbox",
            status: "Mailbox status (ACTIVE, SUSPENDED, etc.)",
          },
        },
        response: {
          success: "Updated mailbox object",
          example: {
            id: "mb_123",
            email: "john@domain.com",
            firstName: "John",
            lastName: "Doe",
            status: "ACTIVE",
          },
        },
        useCases: [
          "Update mailbox names and details",
          "Change mailbox status",
          "Configure mailbox settings",
        ],
        bestPractices: [
          "Use realistic names for better deliverability",
          "Update status carefully to avoid service disruption",
          "Verify mailbox exists before updating",
        ],
      },

      // Additional mailbox endpoints from official documentation
      getMailboxDetails: {
        path: "/v2/mailboxes/{mailboxId}",
        method: "GET",
        description: "Get detailed information about a specific mailbox",
        parameters: {
          path: {
            mailboxId: "ID of the mailbox to get details for (required)",
          },
        },
        response: {
          success: "Detailed mailbox information",
          example: {
            id: "mb_123",
            email: "john@domain.com",
            firstName: "John",
            lastName: "Doe",
            status: "ACTIVE",
            domainId: "dom_123",
            createdAt: "2024-01-15T10:30:00Z",
            lastLogin: "2024-01-15T09:15:00Z",
          },
        },
        useCases: [
          "Get detailed mailbox information",
          "Check mailbox status and health",
          "Verify mailbox configuration",
        ],
        bestPractices: [
          "Use this to verify mailbox details",
          "Check mailbox status before operations",
          "Monitor mailbox activity",
        ],
      },

      removeMailboxesOnRenewal: {
        path: "/v2/mailboxes/{mailboxId}/remove-on-renewal",
        method: "PUT",
        description: "Mark mailboxes for removal on next renewal period",
        parameters: {
          path: {
            mailboxId: "ID of the mailbox to mark for removal (required)",
          },
        },
        response: {
          success: "Mailbox removal scheduling confirmation",
          example: {
            mailboxId: "mb_123",
            removalScheduled: true,
            removalDate: "2024-02-15T00:00:00Z",
            status: "SCHEDULED_FOR_REMOVAL",
          },
        },
        useCases: [
          "Schedule mailbox removal",
          "Plan mailbox cleanup",
          "Manage mailbox lifecycle",
        ],
        bestPractices: [
          "Verify mailbox is no longer needed",
          "Backup important data before removal",
          "Notify users of scheduled removal",
        ],
      },

      getAuthenticatorCode: {
        path: "/v2/mailboxes/{mailboxId}/authenticator",
        method: "GET",
        description:
          "Get authenticator code for mailbox two-factor authentication",
        parameters: {
          path: {
            mailboxId: "ID of the mailbox to get authenticator for (required)",
          },
        },
        response: {
          success: "Authenticator code and setup information",
          example: {
            mailboxId: "mb_123",
            authenticatorCode: "JBSWY3DPEHPK3PXP",
            qrCode: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
            setupUrl:
              "otpauth://totp/john@domain.com?secret=JBSWY3DPEHPK3PXP&issuer=Zapmail",
          },
        },
        useCases: [
          "Set up two-factor authentication",
          "Configure authenticator apps",
          "Enhance mailbox security",
        ],
        bestPractices: [
          "Use secure authenticator apps",
          "Backup authenticator codes",
          "Test 2FA setup before activation",
        ],
      },

      removeMailboxesInstantly: {
        path: "/v2/mailboxes/remove-instantly",
        method: "POST",
        description:
          "Remove mailboxes immediately (not recommended for production)",
        parameters: {
          body: {
            mailboxIds: "Array of mailbox IDs to remove (required)",
            force: "Force removal without confirmation (default: false)",
          },
        },
        response: {
          success: "Instant mailbox removal confirmation",
          example: {
            removedMailboxes: ["mb_123", "mb_456"],
            removedCount: 2,
            status: "REMOVED",
            removedAt: "2024-01-15T10:30:00Z",
          },
        },
        useCases: [
          "Emergency mailbox removal",
          "Clean up test mailboxes",
          "Remove unused mailboxes",
        ],
        bestPractices: [
          "Use with extreme caution",
          "Backup data before removal",
          "Verify mailboxes are truly unused",
          "Consider scheduled removal instead",
        ],
      },
    },
    commonScenarios: {
      createMailboxesOnEmptyDomains: {
        name: "Create Mailboxes on Empty Domains",
        description:
          "Automatically create mailboxes on domains with zero existing mailboxes",
        steps: [
          "1. List all domains in workspace",
          "2. Identify domains with mailboxCount: 0",
          "3. Create specified number of mailboxes on each empty domain",
          "4. Verify successful creation",
        ],
        example: {
          step1: "GET /v2/domains",
          step2: "Filter domains where mailboxCount === 0",
          step3: "POST /v2/mailboxes with domainId and count",
          step4: "GET /v2/mailboxes to verify",
        },
      },

      bulkMailboxUpdate: {
        name: "Bulk Mailbox Update",
        description: "Update multiple mailboxes with new names or settings",
        steps: [
          "1. List mailboxes to identify targets",
          "2. Update each mailbox individually or in batch",
          "3. Verify updates were applied correctly",
        ],
        example: {
          step1: "GET /v2/mailboxes",
          step2: "PUT /v2/mailboxes/{id} for each mailbox",
          step3: "GET /v2/mailboxes to verify changes",
        },
      },
    },
  },

  // Wallet Management
  wallet: {
    name: "Wallet Management",
    description: "Manage wallet balance, transactions, and payments",
    endpoints: {
      getBalance: {
        path: "/v2/wallet/balance",
        method: "GET",
        description: "Get current wallet balance and transaction history",
        parameters: {},
        response: {
          success: "Wallet balance and recent transactions",
          example: {
            balance: 150.75,
            currency: "USD",
            transactions: [
              {
                id: "tx_123",
                amount: -12.99,
                description: "Domain purchase",
                date: "2024-01-15",
              },
            ],
          },
        },
        useCases: [
          "Check available balance before purchases",
          "Review transaction history",
          "Monitor spending patterns",
        ],
        bestPractices: [
          "Check balance before large purchases",
          "Monitor transaction history regularly",
          "Keep sufficient balance for operations",
        ],
      },

      // Additional wallet endpoints from official documentation
      addBalanceToWallet: {
        path: "/v2/wallet/add-balance",
        method: "POST",
        description: "Add balance to wallet using payment method",
        parameters: {
          body: {
            amount: "Amount to add to wallet (required)",
            paymentMethod: "Payment method ID or details (required)",
            currency: "Currency for the transaction (default: USD)",
          },
        },
        response: {
          success: "Wallet balance addition confirmation",
          example: {
            transactionId: "tx_789",
            amount: 100.0,
            newBalance: 250.75,
            status: "COMPLETED",
            addedAt: "2024-01-15T10:30:00Z",
          },
        },
        useCases: [
          "Add funds to wallet for purchases",
          "Recharge wallet balance",
          "Prepare for bulk operations",
        ],
        bestPractices: [
          "Add sufficient balance for planned operations",
          "Use secure payment methods",
          "Keep transaction records",
        ],
      },

      enableAutoRecharge: {
        path: "/v2/wallet/auto-recharge",
        method: "POST",
        description: "Enable automatic wallet recharge when balance is low",
        parameters: {
          body: {
            enabled: "Enable auto recharge (required)",
            threshold: "Balance threshold to trigger recharge (required)",
            amount: "Amount to recharge when threshold is reached (required)",
            paymentMethod: "Payment method to use for auto recharge (required)",
          },
        },
        response: {
          success: "Auto recharge configuration confirmation",
          example: {
            autoRechargeEnabled: true,
            threshold: 10.0,
            rechargeAmount: 50.0,
            paymentMethod: "card_123",
            status: "ACTIVE",
          },
        },
        useCases: [
          "Ensure continuous service availability",
          "Automate wallet management",
          "Prevent service interruptions",
        ],
        bestPractices: [
          "Set appropriate threshold levels",
          "Use reliable payment methods",
          "Monitor auto recharge activity",
        ],
      },
    },
    commonScenarios: {
      checkBalanceBeforePurchase: {
        name: "Check Balance Before Purchase",
        description: "Verify sufficient funds before making purchases",
        steps: [
          "1. Get current wallet balance",
          "2. Calculate total cost of intended purchase",
          "3. Proceed with purchase if sufficient balance",
          "4. Add funds if balance is insufficient",
        ],
        example: {
          step1: "GET /v2/wallet/balance",
          step2: "Calculate total cost",
          step3: "POST /v2/domains/buy (if sufficient balance)",
          step4: "POST /v2/wallet/add-balance (if insufficient)",
        },
      },

      setupAutoRecharge: {
        name: "Setup Auto Recharge for Continuous Operations",
        description:
          "Configure automatic wallet recharge to prevent service interruptions",
        steps: [
          "1. Check current wallet balance",
          "2. Set up auto recharge configuration",
          "3. Test auto recharge functionality",
          "4. Monitor recharge activity",
        ],
        example: {
          step1: "GET /v2/wallet/balance",
          step2: "POST /v2/wallet/auto-recharge",
          step3: "Test with small threshold",
          step4: "Monitor auto recharge logs",
        },
      },
    },
  },

  // Export System (already documented above)
  exports: {
    name: "Export System",
    description: "Export mailboxes to third-party platforms or as files",
    endpoints: {
      addThirdPartyAccount: {
        path: "/v2/exports/accounts/third-party",
        method: "POST",
        description: "Add third-party platform credentials for export",
        parameters: {
          body: {
            email: "Third-party account email (required)",
            password: "Third-party account password (required)",
            app: "Platform name (REACHINBOX, INSTANTLY, etc.) (required)",
          },
        },
        response: {
          success: "Account connection confirmation",
          example: {
            accountId: "acc_123",
            app: "REACHINBOX",
            status: "CONNECTED",
          },
        },
        useCases: [
          "Connect Reachinbox account for export",
          "Add Instantly credentials",
          "Link Smartlead account",
        ],
        bestPractices: [
          "Use app-specific passwords when available",
          "Verify account credentials before adding",
          "Keep credentials secure and up-to-date",
        ],
      },

      exportMailboxes: {
        path: "/v2/exports/mailboxes",
        method: "POST",
        description: "Export mailboxes to connected platforms or as files",
        parameters: {
          body: {
            apps: "Array of target platforms (required)",
            ids: "Specific mailbox IDs to export (optional)",
            contains: "Filter mailboxes containing text (optional)",
            status: "Filter by mailbox status (optional)",
          },
        },
        response: {
          success: "Export confirmation with file download or platform status",
          example: {
            exportId: "exp_123",
            status: "COMPLETED",
            mailboxesExported: 25,
            platform: "REACHINBOX",
          },
        },
        useCases: [
          "Export mailboxes to Reachinbox",
          "Download CSV for manual import",
          "Export specific mailboxes by criteria",
        ],
        bestPractices: [
          "Add third-party credentials before export",
          "Use specific filters to export only needed mailboxes",
          "Export in batches for large numbers",
          "Verify successful import in target platform",
        ],
      },
    },
  },

  // Billing Management
  billing: {
    name: "Billing Management",
    description:
      "Manage billing details, payment methods, and account billing information",
    endpoints: {
      addBillingDetails: {
        path: "/v2/billing",
        method: "POST",
        description: "Add or update billing details for the account",
        parameters: {
          body: {
            paymentMethod: "Payment method details (required)",
            billingAddress: "Billing address information",
            taxInfo: "Tax identification information",
          },
        },
        response: {
          success: "Billing details confirmation",
          example: {
            billingId: "bill_123",
            status: "ACTIVE",
            paymentMethod: "card_123",
          },
        },
        useCases: [
          "Set up payment method for purchases",
          "Update billing information",
          "Configure tax details",
        ],
        bestPractices: [
          "Keep billing information up-to-date",
          "Use secure payment methods",
          "Verify tax information accuracy",
        ],
      },

      updateBillingDetails: {
        path: "/v2/billing",
        method: "PUT",
        description: "Update existing billing details",
        parameters: {
          body: {
            paymentMethod: "Updated payment method details",
            billingAddress: "Updated billing address",
            taxInfo: "Updated tax information",
          },
        },
        response: {
          success: "Updated billing details confirmation",
          example: {
            billingId: "bill_123",
            status: "UPDATED",
            lastUpdated: "2024-01-15T10:30:00Z",
          },
        },
        useCases: [
          "Update payment method",
          "Change billing address",
          "Modify tax information",
        ],
        bestPractices: [
          "Verify changes before submission",
          "Keep backup payment methods",
          "Update billing info before large purchases",
        ],
      },
    },
  },

  // Subscription Management
  subscriptions: {
    name: "Subscription Management",
    description: "Manage account subscriptions, plans, and billing cycles",
    endpoints: {
      getAllSubscriptions: {
        path: "/v2/subscriptions",
        method: "GET",
        description: "Get all active and past subscriptions for the account",
        parameters: {},
        response: {
          success: "Array of subscription objects with plan details and status",
          example: [
            {
              id: "sub_123",
              plan: "PRO",
              status: "ACTIVE",
              currentPeriodStart: "2024-01-01T00:00:00Z",
              currentPeriodEnd: "2024-02-01T00:00:00Z",
              amount: 29.99,
            },
          ],
        },
        useCases: [
          "View all account subscriptions",
          "Check subscription status",
          "Monitor billing cycles",
        ],
        bestPractices: [
          "Monitor subscription status regularly",
          "Track billing cycles",
          "Plan for renewals",
        ],
      },

      cancelSubscription: {
        path: "/v2/subscriptions/{subscriptionId}/cancel",
        method: "POST",
        description: "Cancel an active subscription",
        parameters: {
          path: {
            subscriptionId: "ID of the subscription to cancel (required)",
          },
          body: {
            cancelAtPeriodEnd:
              "Cancel at end of current period (default: true)",
            reason: "Reason for cancellation",
          },
        },
        response: {
          success: "Subscription cancellation confirmation",
          example: {
            subscriptionId: "sub_123",
            status: "CANCELLED",
            cancelAtPeriodEnd: true,
            cancelledAt: "2024-01-15T10:30:00Z",
          },
        },
        useCases: [
          "Cancel unwanted subscriptions",
          "Downgrade account plans",
          "Stop billing for services",
        ],
        bestPractices: [
          "Cancel at period end to avoid service interruption",
          "Document cancellation reasons",
          "Plan for service migration",
        ],
      },

      upgradeSubscription: {
        path: "/v2/subscriptions/{subscriptionId}/upgrade",
        method: "POST",
        description: "Upgrade existing subscription to higher plan",
        parameters: {
          path: {
            subscriptionId: "ID of the subscription to upgrade (required)",
          },
          body: {
            newPlan: "New plan to upgrade to (required)",
            prorate: "Prorate the upgrade cost (default: true)",
          },
        },
        response: {
          success: "Subscription upgrade confirmation",
          example: {
            subscriptionId: "sub_123",
            oldPlan: "BASIC",
            newPlan: "PRO",
            status: "UPGRADED",
            proratedAmount: 15.0,
            upgradedAt: "2024-01-15T10:30:00Z",
          },
        },
        useCases: [
          "Upgrade to higher plan",
          "Get additional features",
          "Increase service limits",
        ],
        bestPractices: [
          "Verify new plan features",
          "Check upgrade costs",
          "Test new plan functionality",
        ],
      },
    },
    commonScenarios: {
      manageSubscription: {
        name: "Manage Account Subscription",
        description: "View, upgrade, or cancel account subscription",
        steps: [
          "1. Get all subscriptions to understand current plan",
          "2. Evaluate plan needs and usage",
          "3. Upgrade if more features needed",
          "4. Cancel if service no longer required",
        ],
        example: {
          step1: "GET /v2/subscriptions",
          step2: "Evaluate current usage and needs",
          step3: "POST /v2/subscriptions/{id}/upgrade (if needed)",
          step4: "POST /v2/subscriptions/{id}/cancel (if needed)",
        },
      },
    },
  },

  // DNS Management
  dns: {
    name: "DNS Management",
    description: "Manage DNS records, configurations, and domain DNS settings",
    endpoints: {
      getDnsRecords: {
        path: "/v2/dns/{domainId}/records",
        method: "GET",
        description: "Get all DNS records for a domain",
        parameters: {
          path: {
            domainId: "Domain ID to get DNS records for (required)",
          },
        },
        response: {
          success: "Array of DNS records for the domain",
          example: [
            { type: "A", name: "@", value: "192.168.1.1", ttl: 3600 },
            {
              type: "MX",
              name: "@",
              value: "mail.zapmail.ai",
              priority: 10,
              ttl: 3600,
            },
            {
              type: "TXT",
              name: "@",
              value: "v=spf1 include:zapmail.ai ~all",
              ttl: 3600,
            },
          ],
        },
        useCases: [
          "View domain DNS configuration",
          "Verify DNS records",
          "Debug domain setup issues",
        ],
        bestPractices: [
          "Regularly check DNS records",
          "Verify all required records exist",
          "Monitor DNS propagation",
        ],
      },

      addDnsRecord: {
        path: "/v2/dns/{domainId}/records",
        method: "POST",
        description: "Add new DNS record to domain",
        parameters: {
          path: {
            domainId: "Domain ID to add DNS record to (required)",
          },
          body: {
            type: "DNS record type (A, MX, TXT, CNAME, etc.) (required)",
            name: "Record name (required)",
            value: "Record value (required)",
            ttl: "Time to live in seconds (default: 3600)",
            priority: "Priority for MX records",
          },
        },
        response: {
          success: "DNS record addition confirmation",
          example: {
            recordId: "dns_123",
            type: "TXT",
            name: "@",
            value: "v=spf1 include:zapmail.ai ~all",
            status: "ACTIVE",
          },
        },
        useCases: [
          "Add email authentication records",
          "Configure domain DNS",
          "Set up custom DNS records",
        ],
        bestPractices: [
          "Verify record format before adding",
          "Use appropriate TTL values",
          "Test DNS changes",
        ],
      },

      updateDnsRecord: {
        path: "/v2/dns/{domainId}/records/{recordId}",
        method: "PUT",
        description: "Update existing DNS record",
        parameters: {
          path: {
            domainId: "Domain ID (required)",
            recordId: "DNS record ID to update (required)",
          },
          body: {
            value: "New record value (required)",
            ttl: "New TTL value",
            priority: "New priority for MX records",
          },
        },
        response: {
          success: "DNS record update confirmation",
          example: {
            recordId: "dns_123",
            status: "UPDATED",
            updatedAt: "2024-01-15T10:30:00Z",
          },
        },
        useCases: [
          "Update DNS record values",
          "Modify TTL settings",
          "Change record priorities",
        ],
        bestPractices: [
          "Verify new values before updating",
          "Monitor DNS propagation",
          "Test changes after update",
        ],
      },

      deleteDnsRecord: {
        path: "/v2/dns/{domainId}/records/{recordId}",
        method: "DELETE",
        description: "Delete DNS record from domain",
        parameters: {
          path: {
            domainId: "Domain ID (required)",
            recordId: "DNS record ID to delete (required)",
          },
        },
        response: {
          success: "DNS record deletion confirmation",
          example: {
            recordId: "dns_123",
            status: "DELETED",
            deletedAt: "2024-01-15T10:30:00Z",
          },
        },
        useCases: [
          "Remove unused DNS records",
          "Clean up DNS configuration",
          "Delete invalid records",
        ],
        bestPractices: [
          "Verify record is no longer needed",
          "Check for dependencies",
          "Monitor DNS after deletion",
        ],
      },
    },
    commonScenarios: {
      setupEmailAuthentication: {
        name: "Setup Email Authentication Records",
        description:
          "Configure SPF, DKIM, and DMARC records for email deliverability",
        steps: [
          "1. Get current DNS records",
          "2. Add SPF record for email authentication",
          "3. Add DKIM record if available",
          "4. Add DMARC record for policy",
          "5. Verify DNS propagation",
        ],
        example: {
          step1: "GET /v2/dns/{domainId}/records",
          step2: "POST /v2/dns/{domainId}/records (SPF)",
          step3: "POST /v2/dns/{domainId}/records (DKIM)",
          step4: "POST /v2/dns/{domainId}/records (DMARC)",
          step5: "Verify propagation with DNS tools",
        },
      },
    },
  },
};

// API guidance and helper functions
const API_GUIDANCE = {
  // Get endpoint information by category and endpoint name
  getEndpointInfo(category, endpointName) {
    const categoryData = API_ENDPOINT_SYSTEM[category];
    if (!categoryData) {
      throw new Error(`Unknown API category: ${category}`);
    }

    const endpointData = categoryData.endpoints[endpointName];
    if (!endpointData) {
      throw new Error(
        `Unknown endpoint: ${endpointName} in category ${category}`
      );
    }

    return {
      category: categoryData.name,
      categoryDescription: categoryData.description,
      ...endpointData,
    };
  },

  // Get all endpoints in a category
  getCategoryEndpoints(category) {
    const categoryData = API_ENDPOINT_SYSTEM[category];
    if (!categoryData) {
      throw new Error(`Unknown API category: ${category}`);
    }

    return {
      category: categoryData.name,
      description: categoryData.description,
      endpoints: Object.keys(categoryData.endpoints),
      commonScenarios: Object.keys(categoryData.commonScenarios || {}),
    };
  },

  // Get common scenarios for a category
  getCategoryScenarios(category) {
    const categoryData = API_ENDPOINT_SYSTEM[category];
    if (!categoryData) {
      throw new Error(`Unknown API category: ${category}`);
    }

    return categoryData.commonScenarios || {};
  },

  // Search endpoints by keyword
  searchEndpoints(keyword) {
    const results = [];

    for (const [category, categoryData] of Object.entries(
      API_ENDPOINT_SYSTEM
    )) {
      for (const [endpointName, endpointData] of Object.entries(
        categoryData.endpoints
      )) {
        const searchText =
          `${categoryData.name} ${endpointData.description} ${endpointData.path}`.toLowerCase();
        if (searchText.includes(keyword.toLowerCase())) {
          results.push({
            category,
            endpointName,
            path: endpointData.path,
            method: endpointData.method,
            description: endpointData.description,
          });
        }
      }
    }

    return results;
  },

  // Get API best practices
  getBestPractices() {
    const practices = [];

    for (const categoryData of Object.values(API_ENDPOINT_SYSTEM)) {
      for (const endpointData of Object.values(categoryData.endpoints)) {
        if (endpointData.bestPractices) {
          practices.push(...endpointData.bestPractices);
        }
      }
    }

    return [...new Set(practices)]; // Remove duplicates
  },

  // Generate API usage examples
  generateExamples(category, endpointName, customParams = {}) {
    const endpointInfo = this.getEndpointInfo(category, endpointName);

    const examples = {
      basic: {
        description: `Basic ${endpointInfo.description}`,
        request: {
          method: endpointInfo.method,
          path: endpointInfo.path,
          ...(endpointInfo.parameters.body && {
            body: endpointInfo.parameters.body,
          }),
          ...(endpointInfo.parameters.query && {
            query: endpointInfo.parameters.query,
          }),
        },
        response: endpointInfo.response.example,
      },
    };

    // Add custom examples based on parameters
    if (customParams.workspace) {
      examples.workspaceSpecific = {
        description: `${endpointInfo.description} for specific workspace`,
        request: {
          method: endpointInfo.method,
          path: endpointInfo.path,
          headers: { "x-workspace-key": customParams.workspace },
        },
      };
    }

    return examples;
  },
};

// ---------------------------------------------------------------------------
// Endpoint manifest loading
// ---------------------------------------------------------------------------

async function loadEndpoints() {
  const startTime = Date.now();
  try {
    logger.info("Loading endpoint manifest from docs.zapmail.ai");

    const resp = await fetch("https://docs.zapmail.ai/llms.txt", {
      headers: { "user-agent": "zapmail-mcp-server/2.0" },
      signal: AbortSignal.timeout(CONFIG.timeoutMs),
    });

    if (!resp.ok) {
      throw new ApiError(
        `Failed to load endpoint manifest: HTTP ${resp.status}`,
        resp.status
      );
    }

    const text = await resp.text();
    const endpoints = [];
    const regex =
      /\[([^\]]+)\]\(https:\/\/docs\.zapmail\.ai\/([^)]+?)\.md\):\s*(.*)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const title = match[1].trim();
      const slug = match[2].trim();
      const description = match[3].trim();
      endpoints.push({ slug, title, description });
    }

    const duration = Date.now() - startTime;
    logger.info(`Loaded ${endpoints.length} endpoints`, {
      duration,
      count: endpoints.length,
    });

    if (metrics) {
      metrics.recordTimer("endpoint_load_duration", duration);
      metrics.increment("endpoints_loaded", endpoints.length);
    }

    return endpoints;
  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error("Failed to load endpoint manifest", {
      error: err.message,
      duration,
    });

    if (metrics) {
      metrics.increment("endpoint_load_errors");
      metrics.recordTimer("endpoint_load_duration", duration);
    }

    return [];
  }
}

let ENDPOINTS = [];
let DYNAMIC_TOOL_MAP = {};
const RESERVED_NAMES = new Set([
  "set_context",
  "wallet_balance",
  "list_workspaces",
  "list_domains",
  "check_domain_availability",
  "purchase_domains",
  "create_mailboxes_for_zero_domains",
  "add_third_party_account",
  "call_endpoint",
  "generate_usernames",
  "generate_name_pairs",
  "generate_domains",
  "check_domain_availability_batch",
  "plan_and_execute",
]);

function buildDynamicToolMap() {
  const map = {};
  for (const { slug } of ENDPOINTS) {
    const name = slug.replace(/-/g, "_");
    if (
      !RESERVED_NAMES.has(name) &&
      !Object.prototype.hasOwnProperty.call(map, name)
    ) {
      map[name] = slug;
    }
  }
  DYNAMIC_TOOL_MAP = map;
}

const ENDPOINTS_PROMISE = loadEndpoints().then((list) => {
  ENDPOINTS = list;
  buildDynamicToolMap();
});

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function buildHeaders(overrides = {}) {
  const apiKey = getApiKey();
  const headers = {
    "content-type": "application/json",
    "x-auth-zapmail": apiKey || "",
    "user-agent": "zapmail-mcp-server/2.0",
  };
  const ws = overrides.workspaceKey ?? CONTEXT.workspaceKey;
  const sp = (
    overrides.serviceProvider ?? CONTEXT.serviceProvider
  )?.toUpperCase();
  if (ws) headers["x-workspace-key"] = ws;
  if (sp) headers["x-service-provider"] = sp;
  return headers;
}

function makeId() {
  return crypto.randomBytes(8).toString("hex");
}

async function apiFetch(
  path,
  {
    method = "GET",
    headers = {},
    query,
    body,
    timeoutMs = CONFIG.timeoutMs,
    maxRetries = CONFIG.maxRetries,
  } = {}
) {
  const startTime = Date.now();
  const requestId = makeId();

  try {
    // Validate inputs
    validateString(path, "path");
    validateString(method, "method");

    // Rate limiting
    await rateLimiter.checkLimit("api");

    // Check cache for GET requests
    if (method === "GET" && cache) {
      const cacheKey = `${method}:${path}:${JSON.stringify(query || {})}`;
      const cached = cache.get(cacheKey);
      if (cached) {
        logger.debug("Cache hit", { requestId, path, method });
        if (metrics) {
          metrics.increment("cache_hits");
          metrics.recordTimer("api_request_duration", Date.now() - startTime);
        }
        return cached;
      }
    }

    const apiKey = getApiKey();
    if (!apiKey)
      throw new ValidationError(
        "ZAPMAIL_API_KEY not configured",
        "apiKey",
        null
      );

    const url = new URL(
      `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`
    );
    if (query && typeof query === "object") {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    const mergedHeaders = { ...buildHeaders(headers), ...headers };
    const payload =
      body !== undefined && body !== null && method !== "GET"
        ? JSON.stringify(body)
        : undefined;

    logger.debug("API request", {
      requestId,
      method,
      path,
      hasBody: !!payload,
    });

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const resp = await fetch(url, {
          method,
          headers: mergedHeaders,
          body: payload,
          signal: controller.signal,
        });

        const text = await resp.text();
        let json;
        try {
          json = text ? JSON.parse(text) : null;
        } catch (parseError) {
          json = null;
          logger.warn("Failed to parse JSON response", {
            requestId,
            status: resp.status,
            text: text.substring(0, 200),
          });
        }

        if (resp.status === 429 || resp.status >= 500) {
          if (attempt < maxRetries) {
            const delay = Math.min(2500 * (attempt + 1), 9000);
            logger.warn("Retrying request", {
              requestId,
              attempt,
              status: resp.status,
              delay,
            });
            await sleep(delay);
            continue;
          }
        }

        clearTimeout(timer);

        if (!resp.ok) {
          const msg = json?.message || resp.statusText || text;
          throw new ApiError(`HTTP ${resp.status}: ${msg}`, resp.status, json);
        }

        const duration = Date.now() - startTime;
        logger.info("API request successful", {
          requestId,
          method,
          path,
          status: resp.status,
          duration,
        });

        if (metrics) {
          metrics.increment("api_requests_success");
          metrics.recordTimer("api_request_duration", duration);
          metrics.recordHistogram("api_response_size", text.length);
        }

        const result = json ?? { raw: text };

        // Cache successful GET requests
        if (method === "GET" && cache && resp.ok) {
          const cacheKey = `${method}:${path}:${JSON.stringify(query || {})}`;
          cache.set(cacheKey, result);
        }

        return result;
      } catch (err) {
        clearTimeout(timer);

        if (attempt === maxRetries) {
          const duration = Date.now() - startTime;
          logger.error("API request failed", {
            requestId,
            method,
            path,
            error: err.message,
            duration,
            attempts: attempt + 1,
          });

          if (metrics) {
            metrics.increment("api_requests_failed");
            metrics.recordTimer("api_request_duration", duration);
          }

          throw err;
        }

        logger.warn("Retrying request after error", {
          requestId,
          attempt,
          error: err.message,
        });
        await sleep(700 * (attempt + 1));
      }
    }
  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error("API request failed", {
      requestId,
      method: method || "UNKNOWN",
      path,
      error: err.message,
      duration,
    });

    if (metrics) {
      metrics.increment("api_requests_failed");
      metrics.recordTimer("api_request_duration", duration);
    }

    throw err;
  }
}

async function fetchDoc(slug) {
  const url = `https://docs.zapmail.ai/${slug}.md`;
  const resp = await fetch(url, {
    headers: { "user-agent": "zapmail-mcp-server/2.0" },
  });
  if (!resp.ok)
    throw new Error(
      `Failed to fetch documentation for ${slug}. HTTP ${resp.status}`
    );
  return await resp.text();
}

function parseMethodAndPath(doc) {
  const explicit = doc.match(/\b(GET|POST|PUT|DELETE|PATCH)\s+\/([^\s`]+)/i);
  if (explicit) {
    const [_, m, p] = explicit;
    return {
      method: m.toUpperCase(),
      path: "/" + p.split(/\s+/)[0].replace(/^api\//i, ""),
    };
  }
  const yaml = doc.match(
    /^[\t ]*\/([^:]+):\s*[\r\n]+[\t ]*(get|post|put|delete|patch):/im
  );
  if (yaml) {
    const [_, p, m] = yaml;
    return { method: m.toUpperCase(), path: "/" + p.trim() };
  }
  const lines = doc.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    const m = lines[i].trim().toUpperCase();
    if (/^(GET|POST|PUT|DELETE|PATCH)$/.test(m)) {
      const p = lines[i + 1].trim();
      if (p.startsWith("/"))
        return { method: m, path: p.replace(/^\/api/i, "") };
    }
  }
  return null;
}

async function invokeSlug({
  slug,
  method,
  path,
  pathParams,
  query,
  body,
  headers,
}) {
  let m = method;
  let p = path;
  if (!m || !p) {
    const doc = await fetchDoc(slug);
    const guess = parseMethodAndPath(doc);
    if (!guess && (!m || !p)) {
      throw new Error(
        `Unable to determine method/path for slug '${slug}'. Provide both explicitly.`
      );
    }
    if (!m) m = guess.method;
    if (!p) p = guess.path;
  }
  if (pathParams && typeof pathParams === "object") {
    for (const [k, v] of Object.entries(pathParams)) {
      p = p.replace(new RegExp(`\{${k}\}`, "g"), encodeURIComponent(String(v)));
    }
  }
  if (!p.startsWith("/")) p = "/" + p;
  p = p.replace(/^\/api\//i, "/");
  return await apiFetch(p, { method: m.toUpperCase(), query, body, headers });
}

// ---------------------------------------------------------------------------
// High-level primitives
// ---------------------------------------------------------------------------

async function getWalletBalance() {
  const data = await apiFetch("/v2/wallet/balance", { method: "GET" });
  const balance =
    typeof data?.walletBalance === "number"
      ? data.walletBalance
      : typeof data?.balance === "number"
        ? data.balance
        : typeof data?.data?.walletBalance === "number"
          ? data.data.walletBalance
          : 0;
  return balance;
}

async function listWorkspaces() {
  return await apiFetch("/v2/workspaces", { method: "GET" });
}

async function listDomains({ contains, workspaceKey, serviceProvider } = {}) {
  // Use input overrides if provided, otherwise fall back to global CONTEXT
  const ws = workspaceKey ?? CONTEXT.workspaceKey;
  const sp = serviceProvider ?? CONTEXT.serviceProvider;
  const headers = {
    ...(ws ? { "x-workspace-key": ws } : {}),
    ...(sp ? { "x-service-provider": String(sp).toUpperCase() } : {}),
  };
  return await apiFetch("/v2/domains", {
    method: "GET",
    query: contains ? { contains } : undefined,
    headers,
  });
}

async function checkDomainAvailabilitySingle(
  domainName,
  years = 1,
  workspaceKey,
  serviceProvider
) {
  // Use input overrides if provided, otherwise fall back to global CONTEXT
  const ws = workspaceKey ?? CONTEXT.workspaceKey;
  const sp = serviceProvider ?? CONTEXT.serviceProvider;
  const headers = {
    ...(ws ? { "x-workspace-key": ws } : {}),
    ...(sp ? { "x-service-provider": String(sp).toUpperCase() } : {}),
  };

  return await invokeSlug({
    slug: "get-available-domains-for-registration-13521189e0",
    method: "POST",
    path: "/v2/domains/available",
    body: { domainName, years },
    headers,
  });
}

async function checkDomainAvailabilityBatch(
  domains,
  years = 1,
  workspaceKey,
  serviceProvider
) {
  const out = [];
  for (const d of domains) {
    const res = await checkDomainAvailabilitySingle(
      d,
      years,
      workspaceKey,
      serviceProvider
    );
    out.push({ domainName: d, result: res });
    await sleep(150);
  }
  return out;
}

async function purchaseDomains({
  domains,
  years = 1,
  preferWallet = true,
  workspaceKey,
  serviceProvider,
}) {
  // Use input overrides if provided, otherwise fall back to global CONTEXT
  const ws = workspaceKey ?? CONTEXT.workspaceKey;
  const sp = serviceProvider ?? CONTEXT.serviceProvider;
  const headers = {
    ...(ws ? { "x-workspace-key": ws } : {}),
    ...(sp ? { "x-service-provider": String(sp).toUpperCase() } : {}),
  };

  let total = 0;
  const specs = [];
  for (const d of domains) {
    const avail = await checkDomainAvailabilitySingle(d, years, ws, sp);
    let price = 0;
    const list = avail?.availableDomains || avail?.data?.availableDomains;
    if (Array.isArray(list) && list.length > 0) {
      const match = list.find(
        (item) =>
          typeof item?.domainName === "string" &&
          item.domainName.toLowerCase() === d.toLowerCase()
      );
      if (match && match.domainPrice !== undefined)
        price = Number(match.domainPrice);
      else if (list[0]?.domainPrice !== undefined)
        price = Number(list[0].domainPrice);
    }
    if (!price) price = Number(avail?.price ?? avail?.data?.price ?? 0);
    specs.push({ domainName: d, years, price });
    total += (price || 0) * years;
  }
  let useWallet = false;
  if (preferWallet) {
    const bal = await getWalletBalance();
    useWallet = bal >= total;
  }
  const payload = {
    domains: specs.map(({ domainName, years }) => ({ domainName, years })),
    useWallet,
  };
  const result = await invokeSlug({
    slug: "get-domains-purchase-payment-link-13521209e0",
    method: "POST",
    path: "/v2/domains/buy",
    body: payload,
    headers,
  });
  return { useWallet, total, result };
}

async function createMailboxesForZeroDomains({
  countPerDomain = 3,
  generator,
  workspaceKey,
  serviceProvider,
}) {
  // Use input overrides if provided, otherwise fall back to global CONTEXT
  const ws = workspaceKey ?? CONTEXT.workspaceKey;
  const sp = serviceProvider ?? CONTEXT.serviceProvider;
  const headers = {
    ...(ws ? { "x-workspace-key": ws } : {}),
    ...(sp ? { "x-service-provider": String(sp).toUpperCase() } : {}),
  };

  const domainsData = await listDomains({
    workspaceKey: ws,
    serviceProvider: sp,
  });
  const items =
    domainsData?.domains ||
    domainsData?.data?.domains ||
    domainsData?.data ||
    domainsData ||
    [];
  const zeroDomains = items.filter((d) => {
    const count =
      d.assignedMailboxesCount ?? d.mailboxes ?? d.mailboxesCount ?? 0;
    return count === 0;
  });
  const created = [];
  for (const d of zeroDomains) {
    const domainId = d.id || d.domainId || d.domainID;
    const domainName = d.domain || d.name;
    if (!domainId || !domainName) continue;

    const mailboxes = generator(domainName, countPerDomain).map((m) => ({
      firstName: m.firstName,
      lastName: m.lastName,
      mailboxUsername: m.mailboxUsername,
      domainName: m.domainName,
    }));

    const payload = { [domainId]: mailboxes };
    const res = await invokeSlug({
      slug: "assign-new-mailboxes-to-domains-13490321e0",
      method: "POST",
      path: "/v2/mailboxes",
      body: payload,
      headers,
    });
    created.push({ domain: domainName, domainId, response: res });
    await sleep(250);
  }
  return { createdCount: created.length, details: created };
}

// ---------------------------------------------------------------------------
// Name + username + domain generators (local, prompt resources exposed)
// ---------------------------------------------------------------------------

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function generateUsernamesLocal({ name, numberOfNames }) {
  const result = { names: [], note: undefined };
  if (!name || typeof name !== "string") return { names: [] };
  const trimmed = name.trim().replace(/\s+/g, " ");
  const parts = trimmed.split(" ");
  const suggestions = new Set();
  const out = [];

  function add(first, last, username) {
    const uname = username.toLowerCase().replace(/[^a-z0-9._]/g, "");
    if (!suggestions.has(uname) && uname && uname.length <= 30) {
      suggestions.add(uname);
      out.push({ firstname: first, lastname: last, username: uname });
    }
  }

  if (parts.length >= 2) {
    const first = capitalize(parts[0]);
    const last = capitalize(parts[parts.length - 1]);
    const f = first.toLowerCase();
    const l = last.toLowerCase();
    add(first, last, f);
    add(first, last, `${f}${l}`);
    add(first, last, `${f}.${l}`);
    add(first, last, `${f}_${l}`);
    add(first, last, `${f.charAt(0)}.${l}`);
    add(first, last, `${f}.${l.charAt(0)}`);
    add(first, last, `${l}.${f}`);
    add(first, last, `${f}.${l.charAt(0)}`);
    add(first, last, `${f}.${l}`);
    add(first, last, `${f.charAt(0)}.${l}`);
  } else {
    const single = capitalize(parts[0]);
    const s = single.toLowerCase();
    add(single, "", s);
    add(single, "", s.split("").join("."));
    let idx = 1;
    while (out.length < numberOfNames && idx < numberOfNames + 6) {
      add(single, "", `${s}${idx}`);
      idx++;
    }
  }
  return {
    names: out.slice(0, numberOfNames),
    note:
      out.length < numberOfNames
        ? `Generated ${out.length} suggestions (requested ${numberOfNames})`
        : undefined,
  };
}

function generateNamePairsLocal({ numberOfNames, ethnicity, gender }) {
  const out = { names: [] };
  const eKey = (ethnicity || "").toLowerCase();
  const gKey = (gender || "").toLowerCase();
  const db = {
    european: {
      male: [
        ["John", "Smith"],
        ["Michael", "Johnson"],
        ["David", "Brown"],
        ["Robert", "Davis"],
        ["James", "Taylor"],
      ],
      female: [
        ["Emma", "Smith"],
        ["Sophia", "Johnson"],
        ["Olivia", "Brown"],
        ["Ava", "Davis"],
        ["Isabella", "Taylor"],
      ],
    },
    "south asian": {
      male: [
        ["Arjun", "Patel"],
        ["Rahul", "Sharma"],
        ["Aman", "Kumar"],
        ["Vikram", "Singh"],
        ["Karan", "Gupta"],
      ],
      female: [
        ["Priya", "Sharma"],
        ["Ananya", "Patel"],
        ["Riya", "Khan"],
        ["Sneha", "Gupta"],
        ["Aisha", "Kumar"],
      ],
    },
    "east asian": {
      male: [
        ["Wei", "Li"],
        ["Jun", "Wang"],
        ["Hao", "Zhang"],
        ["Bo", "Chen"],
        ["Jiang", "Liu"],
      ],
      female: [
        ["Mei", "Li"],
        ["Xiao", "Wang"],
        ["Ling", "Zhang"],
        ["Yue", "Chen"],
        ["Jia", "Liu"],
      ],
    },
    "middle eastern": {
      male: [
        ["Ahmed", "Hassan"],
        ["Omar", "Ali"],
        ["Hassan", "Khan"],
        ["Mustafa", "Yousef"],
        ["Yusuf", "Abdullah"],
      ],
      female: [
        ["Sara", "Ahmed"],
        ["Layla", "Hassan"],
        ["Fatima", "Ali"],
        ["Aisha", "Khan"],
        ["Noor", "Yousef"],
      ],
    },
    african: {
      male: [
        ["Kwame", "Mensah"],
        ["Abebe", "Bekele"],
        ["Tunde", "Okoye"],
        ["Chidi", "Nwosu"],
        ["Juma", "Ochieng"],
      ],
      female: [
        ["Ama", "Mensah"],
        ["Amina", "Bekele"],
        ["Chinwe", "Okoye"],
        ["Zuri", "Nwosu"],
        ["Halima", "Ochieng"],
      ],
    },
    "hispanic/latino": {
      male: [
        ["Juan", "Martinez"],
        ["Carlos", "Garcia"],
        ["Luis", "Rodriguez"],
        ["Pedro", "Lopez"],
        ["Jorge", "Gonzalez"],
      ],
      female: [
        ["Maria", "Martinez"],
        ["Ana", "Garcia"],
        ["Lucia", "Rodriguez"],
        ["Carmen", "Lopez"],
        ["Isabel", "Gonzalez"],
      ],
    },
  };
  const group = db[eKey] || db["european"];
  let list = group[gKey] || group["male"];
  if (gKey === "neutral" || !group[gKey])
    list = [...group.male, ...group.female];
  for (let i = 0; i < numberOfNames; i++) {
    const pair = list[i % list.length];
    out.names.push({ firstname: pair[0], lastname: pair[1] });
  }
  return out;
}

function mailboxGeneratorForDomain(domain) {
  return (domainName, count = 3) => {
    const result = [];
    const used = new Set();
    let i = 0;
    while (result.length < count && i < count * 10) {
      i++;
      const pair = generateNamePairsLocal({
        numberOfNames: 1,
        ethnicity: "european",
        gender: "neutral",
      }).names[0];
      const patterns = [
        `${pair.firstname.toLowerCase()}.${pair.lastname.toLowerCase()}`,
        `${pair.firstname.toLowerCase()}${pair.lastname.toLowerCase()}`,
        `${pair.firstname[0].toLowerCase()}.${pair.lastname.toLowerCase()}`,
        `${pair.lastname.toLowerCase()}.${pair.firstname.toLowerCase()}`,
      ];
      const username = patterns[Math.floor(Math.random() * patterns.length)];
      if (used.has(username)) continue;
      used.add(username);
      result.push({
        firstName: pair.firstname,
        lastName: pair.lastname,
        mailboxUsername: username,
        domainName,
      });
    }
    return result;
  };
}

// ---------------------------------------------------------------------------
// Natural language planner
// ---------------------------------------------------------------------------

const INTENT_PATTERNS = [
  {
    intent: "LIST_WORKSPACES",
    test: (q) => /\b(list|show|get)\b.*\bworkspaces?\b/i.test(q),
  },
  {
    intent: "LIST_DOMAINS",
    test: (q) => /\b(list|show|get)\b.*\bdomains?\b/i.test(q),
  },
  {
    intent: "CHECK_DOMAIN",
    test: (q) =>
      /\b(check|is|are)\b.*\b(domain|domains?)\b.*\bavailable\b/i.test(q),
  },
  {
    intent: "BUY_DOMAINS",
    test: (q) => /\b(buy|purchase|register)\b.*\b(domain|domains?)\b/i.test(q),
  },
  {
    intent: "CREATE_MAILBOXES_EMPTY",
    test: (q) =>
      /\b(create|add|setup)\b.*\b(mailboxes?|inboxes?)\b.*\b(0|zero)\b.*\bdomains?\b/i.test(
        q
      ),
  },
  {
    intent: "CONNECT_EXPORT_APP",
    test: (q) =>
      /\b(connect|link|add)\b.*\b(instantly|reachinbox|smartlead|reply\.?io)\b/i.test(
        q
      ),
  },
  // Enhanced export patterns
  {
    intent: "EXPORT_TO_REACHINBOX",
    test: (q) =>
      /\b(export|send|transfer)\b.*\b(reachinbox|reachin)\b/i.test(q),
  },
  {
    intent: "EXPORT_TO_INSTANTLY",
    test: (q) => /\b(export|send|transfer)\b.*\b(instantly)\b/i.test(q),
  },
  {
    intent: "EXPORT_TO_SMARTLEAD",
    test: (q) => /\b(export|send|transfer)\b.*\b(smartlead)\b/i.test(q),
  },
  {
    intent: "EXPORT_TO_REPLYIO",
    test: (q) =>
      /\b(export|send|transfer)\b.*\b(reply\.?io|replyio)\b/i.test(q),
  },
  {
    intent: "EXPORT_MAILBOXES",
    test: (q) =>
      /\b(export|download|get)\b.*\b(mailboxes?|emails?|contacts?)\b/i.test(q),
  },
  {
    intent: "EXPORT_CSV",
    test: (q) =>
      /\b(export|download|get)\b.*\b(csv|file|spreadsheet)\b/i.test(q),
  },
  {
    intent: "EXPORT_SPECIFIC",
    test: (q) =>
      /\b(export|send)\b.*\b(specific|certain|selected)\b.*\b(mailboxes?|emails?)\b/i.test(
        q
      ),
  },
  {
    intent: "EXPORT_BY_DOMAIN",
    test: (q) =>
      /\b(export|send)\b.*\b(domain|domains?)\b.*\b(mailboxes?|emails?)\b/i.test(
        q
      ),
  },
];

function simpleParseDomains(text) {
  const doms = new Set();
  const re = /\b([a-z0-9-]+\.(?:com|net|org|io|ai|app|co|in))\b/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    doms.add(m[1].toLowerCase());
  }
  return [...doms];
}

function simpleParseYears(text) {
  const m = text.match(/\b(\d+)\s*(?:year|years|yr|yrs)\b/i);
  if (m) return Math.max(1, parseInt(m[1], 10));
  return 1;
}

function simpleParseMailboxCount(text) {
  const m = text.match(/\b(\d+)\s*(?:mailboxes?|inboxes?)\b/i);
  if (m) return Math.max(1, parseInt(m[1], 10));
  return 3;
}

async function planFromRules(nl, options = {}) {
  const q = String(nl || "").trim();
  const steps = [];
  let matched = null;
  for (const pattern of INTENT_PATTERNS) {
    if (pattern.test(q)) {
      matched = pattern.intent;
      break;
    }
  }
  // default compound parse e.g. "setup 100 mailboxes and connect to instantly"
  if (!matched && /\b(mailboxes?|inboxes?)\b.*\b(connect|link)\b/i.test(q)) {
    matched = "CREATE_AND_CONNECT";
  }

  switch (matched) {
    case "LIST_WORKSPACES":
      steps.push({
        action: "api",
        slug: null,
        path: "/v2/workspaces",
        method: "GET",
        description: "List all workspaces",
      });
      break;
    case "LIST_DOMAINS":
      steps.push({
        action: "api",
        slug: null,
        path: "/v2/domains",
        method: "GET",
        description: "List domains in current workspace",
      });
      break;
    case "CHECK_DOMAIN": {
      const domains = simpleParseDomains(q);
      steps.push({
        action: "decision",
        note: "Wallet-first is irrelevant for availability; proceed to availability check.",
      });
      for (const d of domains) {
        steps.push({
          action: "api",
          slug: "get-available-domains-for-registration-13521189e0",
          path: "/v2/domains/available",
          method: "POST",
          body: { domainName: d, years: simpleParseYears(q) },
          description: `Check availability for ${d}`,
        });
      }
      break;
    }
    case "BUY_DOMAINS": {
      const domains = simpleParseDomains(q);
      const years = simpleParseYears(q);
      steps.push({
        action: "api",
        path: "/v2/wallet/balance",
        method: "GET",
        description: "Get wallet balance",
      });
      steps.push({
        action: "compute",
        note: "Check availability & price for each domain, compute total, prefer wallet if sufficient.",
      });
      steps.push({
        action: "api",
        path: "/v2/domains/buy",
        method: "POST",
        bodyFrom: "purchaseDomains",
        years,
        domains,
        description: `Purchase ${domains.length} domains (wallet-first)`,
      });
      break;
    }
    case "CREATE_MAILBOXES_EMPTY": {
      const count = simpleParseMailboxCount(q);
      steps.push({
        action: "api",
        path: "/v2/domains",
        method: "GET",
        description: "List domains",
      });
      steps.push({
        action: "compute",
        note: "Filter domains with 0 mailboxes",
      });
      steps.push({
        action: "api",
        path: "/v2/mailboxes",
        method: "POST",
        bodyFrom: "createMailboxesForZeroDomains",
        count,
        description: `Create ${count} mailboxes on each zero-mailbox domain`,
      });
      break;
    }
    case "CONNECT_EXPORT_APP": {
      let app = "INSTANTLY";
      if (/reachinbox/i.test(q)) app = "REACHINBOX";
      else if (/smartlead/i.test(q)) app = "SMARTLEAD";
      else if (/reply\.?io/i.test(q)) app = "REPLY_IO";
      steps.push({
        action: "api",
        path: "/v2/exports/accounts/third-party",
        method: "POST",
        body: {
          email: options?.email || "placeholder@example.com",
          password: options?.password || "APP_PASSWORD",
          app,
        },
        description: `Connect third-party app ${app}`,
      });
      break;
    }

    // Enhanced export handling cases
    case "EXPORT_TO_REACHINBOX": {
      steps.push({
        action: "info",
        note: "Export to Reachinbox requires credentials. Please provide your Reachinbox email and password.",
      });
      steps.push({
        action: "api",
        path: "/v2/exports/accounts/third-party",
        method: "POST",
        body: {
          email: options?.email || "REQUIRED",
          password: options?.password || "REQUIRED",
          app: "REACHINBOX",
        },
        description: "Add Reachinbox account credentials",
      });
      steps.push({
        action: "api",
        path: "/v2/exports/mailboxes",
        method: "POST",
        body: { apps: ["REACHINBOX"], status: "ACTIVE" },
        description: "Export all active mailboxes to Reachinbox",
      });
      break;
    }

    case "EXPORT_TO_INSTANTLY": {
      steps.push({
        action: "info",
        note: "Export to Instantly requires credentials. Please provide your Instantly email and password.",
      });
      steps.push({
        action: "api",
        path: "/v2/exports/accounts/third-party",
        method: "POST",
        body: {
          email: options?.email || "REQUIRED",
          password: options?.password || "REQUIRED",
          app: "INSTANTLY",
        },
        description: "Add Instantly account credentials",
      });
      steps.push({
        action: "api",
        path: "/v2/exports/mailboxes",
        method: "POST",
        body: { apps: ["INSTANTLY"], status: "ACTIVE" },
        description: "Export all active mailboxes to Instantly",
      });
      break;
    }

    case "EXPORT_TO_SMARTLEAD": {
      steps.push({
        action: "info",
        note: "Export to Smartlead requires credentials. Please provide your Smartlead email and password.",
      });
      steps.push({
        action: "api",
        path: "/v2/exports/accounts/third-party",
        method: "POST",
        body: {
          email: options?.email || "REQUIRED",
          password: options?.password || "REQUIRED",
          app: "SMARTLEAD",
        },
        description: "Add Smartlead account credentials",
      });
      steps.push({
        action: "api",
        path: "/v2/exports/mailboxes",
        method: "POST",
        body: { apps: ["SMARTLEAD"], status: "ACTIVE" },
        description: "Export all active mailboxes to Smartlead",
      });
      break;
    }

    case "EXPORT_TO_REPLYIO": {
      steps.push({
        action: "info",
        note: "Export to Reply.io requires credentials. Please provide your Reply.io email and password.",
      });
      steps.push({
        action: "api",
        path: "/v2/exports/accounts/third-party",
        method: "POST",
        body: {
          email: options?.email || "REQUIRED",
          password: options?.password || "REQUIRED",
          app: "REPLY_IO",
        },
        description: "Add Reply.io account credentials",
      });
      steps.push({
        action: "api",
        path: "/v2/exports/mailboxes",
        method: "POST",
        body: { apps: ["REPLY_IO"], status: "ACTIVE" },
        description: "Export all active mailboxes to Reply.io",
      });
      break;
    }

    case "EXPORT_MAILBOXES": {
      steps.push({
        action: "info",
        note: "Export mailboxes. Please specify target platform or use MANUAL for CSV export.",
      });
      steps.push({
        action: "api",
        path: "/v2/exports/mailboxes",
        method: "POST",
        body: { apps: ["MANUAL"], status: "ACTIVE" },
        description: "Export all active mailboxes as CSV",
      });
      break;
    }

    case "EXPORT_CSV": {
      steps.push({
        action: "api",
        path: "/v2/exports/mailboxes",
        method: "POST",
        body: { apps: ["MANUAL"], status: "ACTIVE" },
        description: "Export all active mailboxes as CSV file",
      });
      break;
    }

    case "EXPORT_SPECIFIC": {
      steps.push({
        action: "info",
        note: "Export specific mailboxes requires mailbox IDs. Please provide the IDs or use filters.",
      });
      steps.push({
        action: "api",
        path: "/v2/exports/mailboxes",
        method: "POST",
        body: { apps: ["MANUAL"], ids: ["REQUIRED_MAILBOX_IDS"] },
        description: "Export specific mailboxes as CSV",
      });
      break;
    }

    case "EXPORT_BY_DOMAIN": {
      const domain = q.match(
        /\b(?:from|in|to)\s+([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/i
      )?.[1];
      if (domain) {
        steps.push({
          action: "api",
          path: "/v2/exports/mailboxes",
          method: "POST",
          body: { apps: ["MANUAL"], contains: domain, status: "ACTIVE" },
          description: `Export mailboxes from domain ${domain} as CSV`,
        });
      } else {
        steps.push({
          action: "info",
          note: "Export by domain requires domain name. Please specify the domain.",
        });
        steps.push({
          action: "api",
          path: "/v2/exports/mailboxes",
          method: "POST",
          body: { apps: ["MANUAL"], contains: "DOMAIN_NAME", status: "ACTIVE" },
          description: "Export mailboxes from specified domain as CSV",
        });
      }
      break;
    }

    case "CREATE_AND_CONNECT": {
      const count = simpleParseMailboxCount(q);
      steps.push({
        action: "api",
        path: "/v2/domains",
        method: "GET",
        description: "List domains",
      });
      steps.push({
        action: "compute",
        note: "Filter domains with 0 mailboxes, choose target domains",
      });
      steps.push({
        action: "api",
        path: "/v2/mailboxes",
        method: "POST",
        bodyFrom: "createMailboxesForZeroDomains",
        count,
        description: `Create ${count} mailboxes/domain`,
      });
      let app = "INSTANTLY";
      if (/reachinbox/i.test(q)) app = "REACHINBOX";
      else if (/smartlead/i.test(q)) app = "SMARTLEAD";
      else if (/reply\.?io/i.test(q)) app = "REPLY_IO";
      steps.push({
        action: "api",
        path: "/v2/exports/accounts/third-party",
        method: "POST",
        body: {
          email: options?.email || "placeholder@example.com",
          password: options?.password || "APP_PASSWORD",
          app,
        },
        description: `Connect ${app}`,
      });
      break;
    }
    default:
      steps.push({
        action: "info",
        note: "No rule matched. Use dynamic endpoint tools or specify slug/path.",
      });
      break;
  }

  return { strategy: "rules", steps };
}

// Optional LLM planner (if OPENAI_API_KEY is set). We keep it simple to avoid external libs.
async function planFromLLM(nl) {
  const prompt = `You are a planner for the Zapmail API. Given a user instruction, output a JSON plan with steps.
Each step has: {action: "api"|"compute"|"decision"|"info", method?, path?, slug?, body?, note?, description?}
Constraints:
- Prefer wallet-first for purchases; call /v2/wallet/balance before buying.
- Always include x-workspace-key and x-service-provider headers (handled by the executor).
- Use documented endpoints: list workspaces (/v2/workspaces), list domains (/v2/domains), check availability (POST /v2/domains/available), purchase (/v2/domains/buy), create mailboxes (POST /v2/mailboxes), connect export (/v2/exports/accounts/third-party).
- If natural language asks for "setup N mailboxes and connect to instantly", plan both mailbox creation then export account connection.
Return ONLY JSON.

User: ${nl}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You output JSON only." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      }),
    });
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "{}";
    const json = JSON.parse(text);
    if (!Array.isArray(json.steps)) throw new Error("Invalid LLM plan");
    return { strategy: "llm", steps: json.steps };
  } catch (e) {
    return {
      strategy: "llm-failed",
      steps: [
        { action: "info", note: "LLM planning failed; fallback to rules." },
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

function buildToolDefinitions() {
  const tools = [];
  tools.push({
    name: "set_context",
    title: "Set workspace and provider context",
    description:
      "Set default x-workspace-key and x-service-provider headers for subsequent API calls.",
    input_schema: {
      type: "object",
      properties: {
        workspaceKey: { type: "string", description: "Workspace ID (UUID)." },
        serviceProvider: {
          type: "string",
          enum: ["GOOGLE", "MICROSOFT"],
          description: "Mail service provider.",
        },
      },
    },
  });
  tools.push({
    name: "wallet_balance",
    title: "Get wallet balance",
    description: "Return the current wallet balance for the active workspace.",
    input_schema: { type: "object", properties: {} },
  });
  tools.push({
    name: "list_workspaces",
    title: "List workspaces",
    description: "Retrieve all workspaces associated with the account.",
    input_schema: { type: "object", properties: {} },
  });
  tools.push({
    name: "list_domains",
    title: "List domains",
    description:
      "List domains in the active workspace. Use set_context to choose the workspace.",
    input_schema: {
      type: "object",
      properties: {
        contains: {
          type: "string",
          description: "Optional substring to filter domain names.",
        },
      },
    },
  });
  tools.push({
    name: "check_domain_availability",
    title: "Check domain availability",
    description:
      "Check if a domain is available for registration and return pricing.",
    input_schema: {
      type: "object",
      properties: {
        domainName: { type: "string", description: "Domain name to check." },
        years: {
          type: "number",
          description: "Registration term (years).",
          default: 1,
        },
      },
      required: ["domainName"],
    },
  });
  tools.push({
    name: "purchase_domains",
    title: "Purchase domains (wallet-first)",
    description:
      "Purchase one or more domains. Prefers wallet funds if sufficient; otherwise returns a payment link.",
    input_schema: {
      type: "object",
      properties: {
        domains: {
          type: "array",
          items: { type: "string" },
          description: "Domains to purchase.",
        },
        years: {
          type: "number",
          description: "Registration term.",
          default: 1,
        },
        preferWallet: {
          type: "boolean",
          description: "Prefer using wallet funds first.",
          default: true,
        },
      },
      required: ["domains"],
    },
  });
  tools.push({
    name: "create_mailboxes_for_zero_domains",
    title: "Create mailboxes on empty domains",
    description:
      "Create N mailboxes on every domain in the active workspace with zero mailboxes.",
    input_schema: {
      type: "object",
      properties: {
        countPerDomain: {
          type: "number",
          description: "Mailboxes to create per domain.",
          default: 3,
        },
      },
    },
  });
  tools.push({
    name: "add_third_party_account",
    title: "Add third-party export account",
    description: "Add credentials for a third-party export integration.",
    input_schema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Email address of the account." },
        password: { type: "string", description: "Password for the account." },
        app: {
          type: "string",
          enum: ["REACHINBOX", "INSTANTLY", "SMARTLEAD", "REPLY_IO"],
          description: "Third-party app to connect.",
        },
      },
      required: ["email", "password", "app"],
    },
  });
  tools.push({
    name: "call_endpoint",
    title: "Call any Zapmail endpoint",
    description:
      "Invoke any Zapmail API endpoint by its documentation slug or an explicit path.",
    input_schema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Documentation slug (filename without .md).",
        },
        method: {
          type: "string",
          enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
          description: "HTTP method override.",
        },
        path: { type: "string", description: "Absolute API path override." },
        pathParams: {
          type: "object",
          description: "Values for path variables.",
          additionalProperties: {},
        },
        query: {
          type: "object",
          description: "Query parameters.",
          additionalProperties: {},
        },
        body: {
          type: "object",
          description: "JSON body for POST/PUT/PATCH.",
          additionalProperties: {},
        },
        workspaceKey: {
          type: "string",
          description: "Override workspace key for this call.",
        },
        serviceProvider: {
          type: "string",
          enum: ["GOOGLE", "MICROSOFT"],
          description: "Override service provider for this call.",
        },
      },
    },
  });
  tools.push({
    name: "generate_usernames",
    title: "Generate mailbox usernames",
    description:
      "Create professional mailbox usernames from a full name or single word using built-in patterns.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Person's full name or single word.",
        },
        numberOfNames: {
          type: "integer",
          minimum: 1,
          description: "Number of usernames to generate.",
        },
      },
      required: ["name", "numberOfNames"],
    },
  });
  tools.push({
    name: "generate_name_pairs",
    title: "Generate name pairs",
    description:
      "Generate culturally appropriate firstname/lastname pairs for a given ethnicity and gender.",
    input_schema: {
      type: "object",
      properties: {
        numberOfNames: {
          type: "integer",
          minimum: 1,
          description: "Number of name pairs to generate.",
        },
        ethnicity: { type: "string", description: "Ethnicity category." },
        gender: {
          type: "string",
          enum: ["male", "female", "neutral"],
          description: "Gender of the person(s).",
        },
      },
      required: ["numberOfNames", "ethnicity", "gender"],
    },
  });
  tools.push({
    name: "generate_domains",
    title: "Generate AI-powered domain suggestions",
    description: "Generate professional domain name suggestions (local rules).",
    input_schema: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          items: { type: "string" },
          description: "Keywords to generate domains from.",
        },
        tlds: {
          type: "array",
          items: { type: "string" },
          description: "TLDs to use.",
          default: [".com"],
        },
        excludeDomains: {
          type: "array",
          items: { type: "string" },
          description: "Domains to exclude.",
          default: [],
        },
        desiredCount: {
          type: "number",
          description: "Number of domains to generate.",
          default: 10,
        },
      },
      required: ["keywords"],
    },
  });
  tools.push({
    name: "check_domain_availability_batch",
    title: "Check domain availability in batch",
    description: "Check availability and pricing for multiple domains at once.",
    input_schema: {
      type: "object",
      properties: {
        domains: {
          type: "array",
          items: { type: "string" },
          description: "Domains to check.",
        },
        years: { type: "number", description: "Years", default: 1 },
      },
      required: ["domains"],
    },
  });
  tools.push({
    name: "plan_and_execute",
    title: "Natural-language plan & execute",
    description:
      "Give a natural language instruction (e.g., 'buy 5 domains and connect Instantly') and the server will plan steps and optionally execute them.",
    input_schema: {
      type: "object",
      properties: {
        instruction: {
          type: "string",
          description: "Natural-language instruction.",
        },
        execute: {
          type: "boolean",
          description:
            "Execute the plan (true) or just return a dry-run plan (false).",
          default: false,
        },
        email: {
          type: "string",
          description: "For third-party connection (if needed).",
        },
        password: {
          type: "string",
          description: "For third-party connection (if needed).",
        },
      },
      required: ["instruction"],
    },
  });

  // Enhanced tools for better functionality
  tools.push({
    name: "get_metrics",
    title: "Get system metrics and performance data",
    description:
      "Retrieve system metrics including API call statistics, cache performance, and error rates.",
    input_schema: {
      type: "object",
      properties: {
        includeCache: {
          type: "boolean",
          description: "Include cache statistics",
          default: true,
        },
        includeTimers: {
          type: "boolean",
          description: "Include timing statistics",
          default: true,
        },
        includeCounters: {
          type: "boolean",
          description: "Include counter statistics",
          default: true,
        },
      },
    },
  });

  tools.push({
    name: "clear_cache",
    title: "Clear system cache",
    description:
      "Clear all cached data to free memory and ensure fresh data retrieval.",
    input_schema: {
      type: "object",
      properties: {
        confirm: {
          type: "boolean",
          description: "Confirmation required to clear cache",
          default: false,
        },
      },
      required: ["confirm"],
    },
  });

  tools.push({
    name: "health_check",
    title: "System health check",
    description:
      "Perform a comprehensive health check of the MCP server including API connectivity, cache status, and configuration validation.",
    input_schema: {
      type: "object",
      properties: {
        detailed: {
          type: "boolean",
          description: "Include detailed health information",
          default: false,
        },
      },
    },
  });

  tools.push({
    name: "bulk_update_mailboxes",
    title: "Bulk update mailboxes",
    description:
      "Update multiple mailboxes with new names, usernames, or other properties in a single operation.",
    input_schema: {
      type: "object",
      properties: {
        updates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              mailboxId: {
                type: "string",
                description: "Mailbox ID to update",
              },
              firstName: { type: "string", description: "New first name" },
              lastName: { type: "string", description: "New last name" },
              username: { type: "string", description: "New username" },
            },
            required: ["mailboxId"],
          },
          description: "Array of mailbox updates to perform",
        },
        workspaceKey: { type: "string", description: "Workspace key override" },
        serviceProvider: {
          type: "string",
          enum: ["GOOGLE", "MICROSOFT"],
          description: "Service provider override",
        },
      },
      required: ["updates"],
    },
  });

  tools.push({
    name: "search_mailboxes",
    title: "Search mailboxes with advanced filters",
    description:
      "Search for mailboxes using various criteria like name, username, domain, or status.",
    input_schema: {
      type: "object",
      properties: {
        firstName: { type: "string", description: "Filter by first name" },
        lastName: { type: "string", description: "Filter by last name" },
        username: { type: "string", description: "Filter by username" },
        domain: { type: "string", description: "Filter by domain" },
        status: {
          type: "string",
          enum: ["ACTIVE", "INACTIVE", "EXPIRED"],
          description: "Filter by status",
        },
        workspaceKey: { type: "string", description: "Workspace key override" },
        serviceProvider: {
          type: "string",
          enum: ["GOOGLE", "MICROSOFT"],
          description: "Service provider override",
        },
      },
    },
  });

  tools.push({
    name: "get_server_info",
    title: "Get server information and configuration",
    description:
      "Retrieve detailed information about the MCP server configuration, features, and capabilities.",
    input_schema: {
      type: "object",
      properties: {
        includeSecrets: {
          type: "boolean",
          description: "Include sensitive configuration details",
          default: false,
        },
      },
    },
  });

  // Export-related tools
  tools.push({
    name: "get_export_info",
    title: "Get export system information",
    description:
      "Get comprehensive information about supported export platforms, flows, and scenarios.",
    input_schema: {
      type: "object",
      properties: {
        platform: {
          type: "string",
          enum: ["REACHINBOX", "INSTANTLY", "SMARTLEAD", "REPLY_IO", "MANUAL"],
          description: "Specific platform to get info about",
        },
        includeExamples: {
          type: "boolean",
          description: "Include detailed examples",
          default: true,
        },
        includeTroubleshooting: {
          type: "boolean",
          description: "Include troubleshooting information",
          default: true,
        },
      },
    },
  });

  tools.push({
    name: "get_export_scenario",
    title: "Get export scenario instructions",
    description: "Get step-by-step instructions for specific export scenarios.",
    input_schema: {
      type: "object",
      properties: {
        scenario: {
          type: "string",
          enum: [
            "exportAllToReachinbox",
            "exportSpecificMailboxes",
            "exportByDomain",
            "manualCSVExport",
          ],
          description: "Export scenario to get instructions for",
        },
        customParams: {
          type: "object",
          description: "Custom parameters to include in the instructions",
          additionalProperties: true,
        },
      },
      required: ["scenario"],
    },
  });

  tools.push({
    name: "validate_export_request",
    title: "Validate export request parameters",
    description:
      "Validate export request parameters before execution to prevent errors.",
    input_schema: {
      type: "object",
      properties: {
        apps: {
          type: "array",
          items: { type: "string" },
          description: "Apps to export to",
        },
        email: { type: "string", description: "Third-party account email" },
        password: {
          type: "string",
          description: "Third-party account password",
        },
        app: { type: "string", description: "Third-party app name" },
        ids: {
          type: "array",
          items: { type: "string" },
          description: "Specific mailbox IDs to export",
        },
        contains: {
          type: "string",
          description: "Filter mailboxes containing this text",
        },
        status: { type: "string", description: "Filter by mailbox status" },
      },
    },
  });

  tools.push({
    name: "export_guidance",
    title: "Get export guidance and best practices",
    description:
      "Get AI-powered guidance for export operations including best practices and recommendations.",
    input_schema: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description: "What you want to achieve with the export",
        },
        platform: { type: "string", description: "Target platform for export" },
        mailboxes: {
          type: "number",
          description: "Approximate number of mailboxes to export",
        },
        filters: {
          type: "object",
          description: "Any specific filters you want to apply",
          additionalProperties: true,
        },
      },
    },
  });

  // API endpoint documentation tools
  tools.push({
    name: "get_api_info",
    title: "Get comprehensive API endpoint information",
    description:
      "Get detailed information about API endpoints, parameters, responses, and usage examples.",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: [
            "workspace",
            "domains",
            "mailboxes",
            "wallet",
            "exports",
            "users",
            "billing",
            "subscriptions",
            "dns",
          ],
          description: "API category to get information about",
        },
        endpoint: {
          type: "string",
          description: "Specific endpoint name within the category",
        },
        includeExamples: {
          type: "boolean",
          description: "Include usage examples",
          default: true,
        },
        includeScenarios: {
          type: "boolean",
          description: "Include common scenarios",
          default: true,
        },
      },
    },
  });

  tools.push({
    name: "search_api_endpoints",
    title: "Search API endpoints by keyword",
    description:
      "Search for API endpoints using keywords to find relevant functionality.",
    input_schema: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          description: "Keyword to search for in endpoint descriptions",
          required: true,
        },
        category: {
          type: "string",
          enum: [
            "workspace",
            "domains",
            "mailboxes",
            "wallet",
            "exports",
            "users",
            "billing",
            "subscriptions",
            "dns",
          ],
          description: "Limit search to specific category",
        },
      },
      required: ["keyword"],
    },
  });

  tools.push({
    name: "get_api_scenarios",
    title: "Get common API usage scenarios",
    description:
      "Get step-by-step scenarios for common API operations and workflows.",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: [
            "workspace",
            "domains",
            "mailboxes",
            "wallet",
            "exports",
            "users",
            "billing",
            "subscriptions",
            "dns",
          ],
          description: "API category to get scenarios for",
        },
        scenario: {
          type: "string",
          description: "Specific scenario name within the category",
        },
      },
    },
  });

  tools.push({
    name: "get_api_best_practices",
    title: "Get API best practices and recommendations",
    description:
      "Get comprehensive best practices for using the Zapmail API effectively.",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: [
            "workspace",
            "domains",
            "mailboxes",
            "wallet",
            "exports",
            "users",
            "billing",
            "subscriptions",
            "dns",
          ],
          description: "API category to get best practices for",
        },
        endpoint: {
          type: "string",
          description: "Specific endpoint to get best practices for",
        },
      },
    },
  });

  tools.push({
    name: "generate_api_examples",
    title: "Generate API usage examples",
    description:
      "Generate practical examples for API endpoint usage with custom parameters.",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: [
            "workspace",
            "domains",
            "mailboxes",
            "wallet",
            "exports",
            "users",
            "billing",
            "subscriptions",
            "dns",
          ],
          description: "API category",
          required: true,
        },
        endpoint: {
          type: "string",
          description: "Endpoint name",
          required: true,
        },
        customParams: {
          type: "object",
          description: "Custom parameters to include in examples",
          additionalProperties: true,
        },
      },
      required: ["category", "endpoint"],
    },
  });
  for (const { slug, title, description } of ENDPOINTS) {
    const toolName = slug.replace(/-/g, "_");
    if (RESERVED_NAMES.has(toolName)) continue;
    if (tools.find((t) => t.name === toolName)) continue;
    tools.push({
      name: toolName,
      title: title || toolName,
      description: `${description || ""} Invoke this endpoint.`,
      input_schema: {
        type: "object",
        properties: {
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
            description: "Override HTTP method.",
          },
          path: { type: "string", description: "Override absolute API path." },
          pathParams: {
            type: "object",
            description: "Values for path variables.",
            additionalProperties: {},
          },
          query: {
            type: "object",
            description: "Query parameters.",
            additionalProperties: {},
          },
          body: {
            type: "object",
            description: "JSON body for POST/PUT/PATCH.",
            additionalProperties: {},
          },
          workspaceKey: {
            type: "string",
            description: "Override workspace key.",
          },
          serviceProvider: {
            type: "string",
            enum: ["GOOGLE", "MICROSOFT"],
            description: "Override service provider.",
          },
        },
      },
    });
  }
  return tools;
}

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

function sendResult(id, result) {
  stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}
function sendError(id, code, message, data) {
  stdout.write(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message, data } }) +
      "\n"
  );
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleToolsList(id) {
  await ENDPOINTS_PROMISE;
  const tools = buildToolDefinitions();
  sendResult(id, { tools });
}

async function handleToolsInvoke(id, params) {
  await ENDPOINTS_PROMISE;
  const name = params?.tool_name;
  const input = params?.input || {};
  try {
    if (name === "set_context") {
      if (typeof input.workspaceKey === "string")
        CONTEXT.workspaceKey = input.workspaceKey;
      if (typeof input.serviceProvider === "string")
        CONTEXT.serviceProvider = input.serviceProvider.toUpperCase();
      sendResult(id, { message: "Context updated", context: CONTEXT });
      return;
    }
    if (name === "wallet_balance") {
      const balance = await getWalletBalance();
      sendResult(id, { balance, context: CONTEXT });
      return;
    }
    if (name === "list_workspaces") {
      const data = await listWorkspaces();
      sendResult(id, { workspaces: data });
      return;
    }
    if (name === "list_domains") {
      const data = await listDomains({
        contains: input.contains,
        workspaceKey: input.workspaceKey,
        serviceProvider: input.serviceProvider,
      });
      sendResult(id, { domains: data });
      return;
    }
    if (name === "check_domain_availability") {
      if (typeof input.domainName !== "string")
        throw new Error("'domainName' is required and must be a string");
      const years = input.years ?? 1;
      const data = await checkDomainAvailabilitySingle(
        input.domainName,
        years,
        input.workspaceKey,
        input.serviceProvider
      );
      sendResult(id, { domainName: input.domainName, availability: data });
      return;
    }
    if (name === "purchase_domains") {
      if (!Array.isArray(input.domains) || input.domains.length === 0)
        throw new Error("'domains' must be a non-empty array of strings");
      const years = input.years ?? 1;
      const preferWallet = input.preferWallet ?? true;
      const data = await purchaseDomains({
        domains: input.domains,
        years,
        preferWallet,
        workspaceKey: input.workspaceKey,
        serviceProvider: input.serviceProvider,
      });
      sendResult(id, data);
      return;
    }
    if (name === "create_mailboxes_for_zero_domains") {
      const gen = mailboxGeneratorForDomain();
      const out = await createMailboxesForZeroDomains({
        countPerDomain: input.countPerDomain ?? 3,
        generator: gen,
        workspaceKey: input.workspaceKey,
        serviceProvider: input.serviceProvider,
      });
      sendResult(id, out);
      return;
    }
    if (name === "add_third_party_account") {
      const { email, password, app } = input;
      if (!email || !password || !app)
        throw new Error("'email', 'password' and 'app' are required");
      // Use input overrides if provided, otherwise fall back to global CONTEXT
      const ws = input.workspaceKey ?? CONTEXT.workspaceKey;
      const sp = input.serviceProvider ?? CONTEXT.serviceProvider;
      const headers = {
        ...(ws ? { "x-workspace-key": ws } : {}),
        ...(sp ? { "x-service-provider": String(sp).toUpperCase() } : {}),
      };
      const data = await invokeSlug({
        slug: "add-third-party-account-details-13490752e0",
        method: "POST",
        path: "/v2/exports/accounts/third-party",
        body: { email, password, app },
        headers,
      });
      sendResult(id, data);
      return;
    }
    if (name === "call_endpoint") {
      const {
        slug,
        method,
        path,
        pathParams,
        query,
        body,
        workspaceKey,
        serviceProvider,
      } = input;
      if (typeof slug !== "string" && typeof path !== "string")
        throw new Error("'slug' or 'path' is required");
      // Use input overrides if provided, otherwise fall back to global CONTEXT
      const ws = workspaceKey ?? CONTEXT.workspaceKey;
      const sp = serviceProvider ?? CONTEXT.serviceProvider;
      const headers = {
        ...(ws ? { "x-workspace-key": ws } : {}),
        ...(sp ? { "x-service-provider": String(sp).toUpperCase() } : {}),
      };
      const data = await invokeSlug({
        slug,
        method,
        path,
        pathParams,
        query,
        body,
        headers,
      });
      sendResult(id, data);
      return;
    }
    if (name === "generate_usernames") {
      const { name: personName, numberOfNames } = input;
      if (typeof personName !== "string" || !personName.trim())
        throw new Error("'name' is required and must be a non-empty string");
      const count = parseInt(numberOfNames, 10);
      if (isNaN(count) || count < 1)
        throw new Error("'numberOfNames' must be a positive integer");
      const result = generateUsernamesLocal({
        name: personName,
        numberOfNames: count,
      });
      sendResult(id, result);
      return;
    }
    if (name === "generate_name_pairs") {
      const { numberOfNames, ethnicity, gender } = input;
      const count = parseInt(numberOfNames, 10);
      if (isNaN(count) || count < 1)
        throw new Error("'numberOfNames' must be a positive integer");
      if (typeof ethnicity !== "string" || !ethnicity.trim())
        throw new Error("'ethnicity' is required and must be a string");
      const g = typeof gender === "string" ? gender.toLowerCase() : "neutral";
      const result = generateNamePairsLocal({
        numberOfNames: count,
        ethnicity: ethnicity,
        gender: g,
      });
      sendResult(id, result);
      return;
    }
    if (name === "generate_domains") {
      const {
        keywords,
        tlds = [".com"],
        excludeDomains = [],
        desiredCount = 10,
      } = input;
      if (!Array.isArray(keywords) || keywords.length === 0)
        throw new Error("'keywords' must be a non-empty array of strings");
      const uniq = new Set();
      const out = [];
      const suff = tlds && tlds.length ? tlds : [".com"];
      const base = keywords
        .map((k) =>
          String(k)
            .toLowerCase()
            .replace(/[^a-z]/g, "")
        )
        .filter(Boolean);
      const candidates = [
        "pro",
        "hub",
        "tech",
        "digital",
        "connect",
        "bridge",
        "flow",
        "sync",
        "link",
        "net",
        "web",
        "app",
        "io",
        "ai",
      ];
      while (out.length < desiredCount && out.length < 200) {
        for (const kw of base) {
          for (const sfx of candidates) {
            for (const t of suff) {
              const dom = `${kw}${sfx}${t}`;
              if (!uniq.has(dom) && !excludeDomains.includes(dom)) {
                uniq.add(dom);
                out.push(dom);
                if (out.length >= desiredCount) break;
              }
            }
            if (out.length >= desiredCount) break;
          }
          if (out.length >= desiredCount) break;
        }
      }
      sendResult(id, { domains: out.slice(0, desiredCount) });
      return;
    }
    if (name === "check_domain_availability_batch") {
      const { domains, years = 1 } = input;
      if (!Array.isArray(domains) || domains.length === 0)
        throw new Error("'domains' must be a non-empty array of strings");
      const results = await checkDomainAvailabilityBatch(
        domains,
        years,
        input.workspaceKey,
        input.serviceProvider
      );
      sendResult(id, { results });
      return;
    }
    if (name === "plan_and_execute") {
      const { instruction, execute = false, email, password } = input;
      if (!instruction || typeof instruction !== "string")
        throw new Error("'instruction' is required");
      const rulePlan = await planFromRules(instruction, { email, password });
      let plan = rulePlan;
      if (FEATURE_FLAGS.llmPlanner) {
        const llm = await planFromLLM(instruction);
        if (
          llm?.steps &&
          llm.steps.length > 0 &&
          llm.strategy !== "llm-failed"
        ) {
          plan = llm;
        }
      }
      if (!execute) {
        sendResult(id, {
          mode: "dry-run",
          strategy: plan.strategy,
          steps: plan.steps,
        });
        return;
      }
      // Execute
      const results = [];
      for (const step of plan.steps) {
        if (step.action === "api") {
          let data;
          if (step.bodyFrom === "purchaseDomains") {
            data = await purchaseDomains({
              domains: step.domains || [],
              years: step.years || 1,
              preferWallet: true,
              workspaceKey: input.workspaceKey,
              serviceProvider: input.serviceProvider,
            });
          } else if (step.bodyFrom === "createMailboxesForZeroDomains") {
            const gen = mailboxGeneratorForDomain();
            data = await createMailboxesForZeroDomains({
              countPerDomain: step.count || 3,
              generator: gen,
              workspaceKey: input.workspaceKey,
              serviceProvider: input.serviceProvider,
            });
          } else {
            // Use input overrides if provided, otherwise fall back to global CONTEXT
            const ws = input.workspaceKey ?? CONTEXT.workspaceKey;
            const sp = input.serviceProvider ?? CONTEXT.serviceProvider;
            const headers = {
              ...(ws ? { "x-workspace-key": ws } : {}),
              ...(sp ? { "x-service-provider": String(sp).toUpperCase() } : {}),
            };
            data = await apiFetch(step.path, {
              method: step.method || "GET",
              body: step.body,
              headers,
            });
          }
          results.push({ step, ok: true, data });
          await sleep(250);
        } else {
          results.push({ step, ok: true });
        }
      }
      sendResult(id, {
        mode: "execute",
        strategy: plan.strategy,
        steps: plan.steps,
        results,
      });
      return;
    }

    // Enhanced tool handlers
    if (name === "get_metrics") {
      const {
        includeCache = true,
        includeTimers = true,
        includeCounters = true,
      } = input;
      const result = {
        timestamp: new Date().toISOString(),
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: "2.0-enhanced",
        },
      };

      if (metrics && includeCounters) {
        result.metrics = metrics.getStats();
      }

      if (cache && includeCache) {
        result.cache = {
          size: cache.size(),
          enabled: CONFIG.enableCaching,
        };
      }

      if (includeTimers && metrics) {
        result.timers = metrics.getStats().timers;
      }

      sendResult(id, result);
      return;
    }

    if (name === "clear_cache") {
      const { confirm } = input;
      if (!confirm) {
        sendError(
          id,
          -32000,
          "Cache clear requires confirmation. Set confirm: true to proceed."
        );
        return;
      }

      if (cache) {
        cache.clear();
        logger.info("Cache cleared", { requestId: id });
        sendResult(id, { message: "Cache cleared successfully", cacheSize: 0 });
      } else {
        sendResult(id, { message: "Cache is not enabled", cacheSize: 0 });
      }
      return;
    }

    if (name === "health_check") {
      const { detailed = false } = input;
      const health = {
        status: "healthy",
        timestamp: new Date().toISOString(),
        checks: {},
      };

      // API connectivity check
      try {
        const apiKey = getApiKey();
        health.checks.apiKey = apiKey ? "configured" : "missing";

        if (apiKey) {
          // Test API connectivity
          const testResponse = await apiFetch("/v2/user", { timeoutMs: 5000 });
          health.checks.apiConnectivity = "connected";
          if (detailed) health.checks.apiResponse = testResponse;
        } else {
          health.checks.apiConnectivity = "no_api_key";
        }
      } catch (error) {
        health.status = "degraded";
        health.checks.apiConnectivity = "failed";
        if (detailed) health.checks.apiError = error.message;
      }

      // Configuration check
      health.checks.configuration = {
        logLevel: CONFIG.logLevel,
        maxRetries: CONFIG.maxRetries,
        timeoutMs: CONFIG.timeoutMs,
        enableCaching: CONFIG.enableCaching,
        enableMetrics: CONFIG.enableMetrics,
      };

      // Cache status
      if (cache) {
        health.checks.cache = {
          enabled: true,
          size: cache.size(),
          maxSize: cache.maxSize,
        };
      } else {
        health.checks.cache = { enabled: false };
      }

      // Metrics status
      if (metrics) {
        const stats = metrics.getStats();
        health.checks.metrics = {
          enabled: true,
          totalRequests:
            stats.counters.api_requests_success +
            stats.counters.api_requests_failed,
          successRate:
            stats.counters.api_requests_success /
              (stats.counters.api_requests_success +
                stats.counters.api_requests_failed) || 0,
        };
      } else {
        health.checks.metrics = { enabled: false };
      }

      sendResult(id, health);
      return;
    }

    if (name === "bulk_update_mailboxes") {
      const { updates, workspaceKey, serviceProvider } = input;

      if (!Array.isArray(updates) || updates.length === 0) {
        throw new ValidationError(
          "'updates' must be a non-empty array",
          "updates",
          updates
        );
      }

      const results = [];
      const errors = [];

      for (let i = 0; i < updates.length; i++) {
        const update = updates[i];
        try {
          validateString(update.mailboxId, "mailboxId");

          const updateData = {};
          if (update.firstName)
            updateData.firstName = validateString(
              update.firstName,
              "firstName"
            );
          if (update.lastName)
            updateData.lastName = validateString(update.lastName, "lastName");
          if (update.username)
            updateData.username = validateString(update.username, "username");

          if (Object.keys(updateData).length === 0) {
            errors.push({ index: i, error: "No valid update fields provided" });
            continue;
          }

          const ws = workspaceKey ?? CONTEXT.workspaceKey;
          const sp = serviceProvider ?? CONTEXT.serviceProvider;
          const headers = {
            ...(ws ? { "x-workspace-key": ws } : {}),
            ...(sp ? { "x-service-provider": String(sp).toUpperCase() } : {}),
          };

          const data = await apiFetch("/v2/mailboxes", {
            method: "PUT",
            body: {
              mailboxData: [
                {
                  mailboxId: update.mailboxId,
                  ...updateData,
                },
              ],
            },
            headers,
          });

          results.push({
            index: i,
            mailboxId: update.mailboxId,
            status: "success",
            data,
          });

          // Rate limiting between updates
          if (i < updates.length - 1) {
            await sleep(CONFIG.rateLimitDelay);
          }
        } catch (error) {
          errors.push({
            index: i,
            mailboxId: update.mailboxId,
            error: error.message,
          });
        }
      }

      sendResult(id, {
        total: updates.length,
        successful: results.length,
        failed: errors.length,
        results,
        errors,
      });
      return;
    }

    if (name === "search_mailboxes") {
      const {
        firstName,
        lastName,
        username,
        domain,
        status,
        workspaceKey,
        serviceProvider,
      } = input;

      // Get all mailboxes first
      const ws = workspaceKey ?? CONTEXT.workspaceKey;
      const sp = serviceProvider ?? CONTEXT.serviceProvider;
      const headers = {
        ...(ws ? { "x-workspace-key": ws } : {}),
        ...(sp ? { "x-service-provider": String(sp).toUpperCase() } : {}),
      };

      const allMailboxes = await apiFetch("/v2/mailboxes/list", { headers });

      if (!allMailboxes.data || !allMailboxes.data.domains) {
        sendResult(id, { mailboxes: [], total: 0 });
        return;
      }

      let filteredMailboxes = [];

      // Flatten all mailboxes from all domains
      for (const domainData of allMailboxes.data.domains) {
        if (
          domain &&
          !domainData.domain.toLowerCase().includes(domain.toLowerCase())
        ) {
          continue;
        }

        for (const mailbox of domainData.mailboxes || []) {
          let include = true;

          if (
            firstName &&
            !mailbox.firstName?.toLowerCase().includes(firstName.toLowerCase())
          ) {
            include = false;
          }

          if (
            lastName &&
            !mailbox.lastName?.toLowerCase().includes(lastName.toLowerCase())
          ) {
            include = false;
          }

          if (
            username &&
            !mailbox.username?.toLowerCase().includes(username.toLowerCase())
          ) {
            include = false;
          }

          if (status && mailbox.status !== status) {
            include = false;
          }

          if (include) {
            filteredMailboxes.push({
              ...mailbox,
              domain: domainData.domain,
            });
          }
        }
      }

      sendResult(id, {
        mailboxes: filteredMailboxes,
        total: filteredMailboxes.length,
        filters: { firstName, lastName, username, domain, status },
      });
      return;
    }

    if (name === "get_server_info") {
      const { includeSecrets = false } = input;

      const info = {
        version: "2.0-enhanced",
        features: {
          llmPlanner: FEATURE_FLAGS.llmPlanner,
          caching: CONFIG.enableCaching,
          metrics: CONFIG.enableMetrics,
          rateLimiting: true,
          enhancedLogging: true,
          validation: true,
          exportSystem: true,
        },
        configuration: {
          logLevel: CONFIG.logLevel,
          maxRetries: CONFIG.maxRetries,
          timeoutMs: CONFIG.timeoutMs,
          rateLimitDelay: CONFIG.rateLimitDelay,
        },
        context: {
          workspaceKey: CONTEXT.workspaceKey ? "configured" : "not_set",
          serviceProvider: CONTEXT.serviceProvider,
        },
        endpoints: {
          total: ENDPOINTS.length,
          dynamic: Object.keys(DYNAMIC_TOOL_MAP).length,
        },
        exportSystem: {
          supportedPlatforms: Object.keys(EXPORT_SYSTEM.supportedApps),
          scenarios: Object.keys(EXPORT_SYSTEM.scenarios),
          flows: Object.keys(EXPORT_SYSTEM.exportFlows),
        },
        apiDocumentation: {
          categories: Object.keys(API_ENDPOINT_SYSTEM),
          totalEndpoints: Object.values(API_ENDPOINT_SYSTEM).reduce(
            (total, category) => total + Object.keys(category.endpoints).length,
            0
          ),
          totalScenarios: Object.values(API_ENDPOINT_SYSTEM).reduce(
            (total, category) =>
              total + Object.keys(category.commonScenarios || {}).length,
            0
          ),
        },
      };

      if (includeSecrets) {
        info.configuration.apiKey = getApiKey() ? "configured" : "not_set";
        info.configuration.openaiKey = env.OPENAI_API_KEY
          ? "configured"
          : "not_set";
      }

      sendResult(id, info);
      return;
    }

    // Export-related tool handlers
    if (name === "get_export_info") {
      const {
        platform,
        includeExamples = true,
        includeTroubleshooting = true,
      } = input;

      let result = {
        supportedPlatforms: EXPORT_SYSTEM.supportedApps,
        exportFlows: EXPORT_SYSTEM.exportFlows,
        bestPractices: EXPORT_SYSTEM.bestPractices,
      };

      if (platform) {
        const platformInfo = EXPORT_SYSTEM.supportedApps[platform];
        if (platformInfo) {
          result.platformInfo = platformInfo;
          if (includeExamples) {
            result.examples = EXPORT_SYSTEM.scenarios;
          }
          if (includeTroubleshooting) {
            result.troubleshooting = EXPORT_SYSTEM.troubleshooting;
          }
        } else {
          sendError(id, -32000, `Unsupported platform: ${platform}`);
          return;
        }
      }

      sendResult(id, result);
      return;
    }

    if (name === "get_export_scenario") {
      const { scenario, customParams = {} } = input;

      try {
        const instructions = EXPORT_HELPERS.generateInstructions(
          scenario,
          customParams
        );
        sendResult(id, instructions);
      } catch (error) {
        sendError(id, -32000, error.message);
      }
      return;
    }

    if (name === "validate_export_request") {
      try {
        const isValid = EXPORT_HELPERS.validateExportRequest(input);
        const result = {
          valid: isValid,
          message: "Export request parameters are valid",
          recommendations: [],
        };

        // Add specific recommendations
        if (
          input.apps &&
          input.apps.includes("MANUAL") &&
          input.apps.length > 1
        ) {
          result.recommendations.push(
            "Consider using only MANUAL export for file download, or separate direct integrations"
          );
        }

        if (input.ids && input.ids.length > 100) {
          result.recommendations.push(
            "Consider exporting in smaller batches for better performance"
          );
        }

        if (!input.status && !input.ids && !input.contains) {
          result.recommendations.push(
            "Consider adding filters to export only specific mailboxes"
          );
        }

        sendResult(id, result);
      } catch (error) {
        sendResult(id, {
          valid: false,
          error: error.message,
          details: error.details || {},
          troubleshooting: EXPORT_HELPERS.getTroubleshooting(error.message),
        });
      }
      return;
    }

    if (name === "export_guidance") {
      const { goal, platform, mailboxes, filters } = input;

      let guidance = {
        goal: goal || "Export mailboxes",
        recommendations: [],
        steps: [],
        warnings: [],
      };

      // Platform-specific guidance
      if (platform) {
        const platformInfo = EXPORT_SYSTEM.supportedApps[platform];
        if (platformInfo) {
          guidance.platform = platformInfo;
          guidance.steps = platformInfo.setupSteps;

          if (platform === "REACHINBOX") {
            guidance.recommendations.push(
              "Ensure your Reachinbox account is active and has sufficient credits"
            );
            guidance.recommendations.push(
              "Consider warming up your account before large exports"
            );
          } else if (platform === "INSTANTLY") {
            guidance.recommendations.push(
              "Verify your Instantly account has the necessary permissions"
            );
            guidance.recommendations.push(
              "Check your sending limits before export"
            );
          }
        }
      }

      // Volume-based guidance
      if (mailboxes) {
        if (mailboxes > 1000) {
          guidance.warnings.push(
            "Large export detected. Consider exporting in batches of 500-1000 mailboxes"
          );
          guidance.recommendations.push(
            "Use specific filters to reduce export size"
          );
        } else if (mailboxes > 100) {
          guidance.recommendations.push(
            "Consider testing with a small subset first"
          );
        }
      }

      // Filter-based guidance
      if (filters) {
        if (filters.status === "ACTIVE") {
          guidance.recommendations.push(
            "Good choice to export only active mailboxes"
          );
        }
        if (filters.contains) {
          guidance.recommendations.push(
            "Domain filtering will help target specific campaigns"
          );
        }
      }

      // General best practices
      guidance.recommendations.push(...EXPORT_SYSTEM.bestPractices.slice(0, 3));

      sendResult(id, guidance);
      return;
    }

    // API endpoint documentation tool handlers
    if (name === "get_api_info") {
      const {
        category,
        endpoint,
        includeExamples = true,
        includeScenarios = true,
      } = input;

      try {
        if (endpoint) {
          // Get specific endpoint information
          const endpointInfo = API_GUIDANCE.getEndpointInfo(category, endpoint);
          const result = {
            ...endpointInfo,
            ...(includeExamples && {
              examples: API_GUIDANCE.generateExamples(category, endpoint),
            }),
          };
          sendResult(id, result);
        } else {
          // Get all endpoints in category
          const categoryInfo = API_GUIDANCE.getCategoryEndpoints(category);
          const result = {
            ...categoryInfo,
            ...(includeScenarios && {
              scenarios: API_GUIDANCE.getCategoryScenarios(category),
            }),
          };
          sendResult(id, result);
        }
      } catch (error) {
        sendError(id, -32000, error.message);
      }
      return;
    }

    if (name === "search_api_endpoints") {
      const { keyword, category } = input;

      try {
        let results = API_GUIDANCE.searchEndpoints(keyword);

        // Filter by category if specified
        if (category) {
          results = results.filter((result) => result.category === category);
        }

        sendResult(id, {
          keyword,
          category: category || "all",
          results,
          total: results.length,
        });
      } catch (error) {
        sendError(id, -32000, error.message);
      }
      return;
    }

    if (name === "get_api_scenarios") {
      const { category, scenario } = input;

      try {
        if (scenario) {
          // Get specific scenario
          const scenarios = API_GUIDANCE.getCategoryScenarios(category);
          const scenarioInfo = scenarios[scenario];
          if (!scenarioInfo) {
            sendError(
              id,
              -32000,
              `Unknown scenario: ${scenario} in category ${category}`
            );
            return;
          }
          sendResult(id, scenarioInfo);
        } else {
          // Get all scenarios in category
          const scenarios = API_GUIDANCE.getCategoryScenarios(category);
          sendResult(id, {
            category: API_ENDPOINT_SYSTEM[category].name,
            scenarios,
          });
        }
      } catch (error) {
        sendError(id, -32000, error.message);
      }
      return;
    }

    if (name === "get_api_best_practices") {
      const { category, endpoint } = input;

      try {
        if (endpoint) {
          // Get best practices for specific endpoint
          const endpointInfo = API_GUIDANCE.getEndpointInfo(category, endpoint);
          sendResult(id, {
            category: endpointInfo.category,
            endpoint: endpoint,
            bestPractices: endpointInfo.bestPractices || [],
          });
        } else {
          // Get all best practices for category
          const categoryData = API_ENDPOINT_SYSTEM[category];
          const practices = [];

          for (const endpointData of Object.values(categoryData.endpoints)) {
            if (endpointData.bestPractices) {
              practices.push(...endpointData.bestPractices);
            }
          }

          sendResult(id, {
            category: categoryData.name,
            bestPractices: [...new Set(practices)], // Remove duplicates
          });
        }
      } catch (error) {
        sendError(id, -32000, error.message);
      }
      return;
    }

    if (name === "generate_api_examples") {
      const { category, endpoint, customParams = {} } = input;

      try {
        const examples = API_GUIDANCE.generateExamples(
          category,
          endpoint,
          customParams
        );
        sendResult(id, {
          category: API_ENDPOINT_SYSTEM[category].name,
          endpoint,
          examples,
        });
      } catch (error) {
        sendError(id, -32000, error.message);
      }
      return;
    }

    if (Object.prototype.hasOwnProperty.call(DYNAMIC_TOOL_MAP, name)) {
      const slug = DYNAMIC_TOOL_MAP[name];
      const {
        method,
        path,
        pathParams,
        query,
        body,
        workspaceKey,
        serviceProvider,
      } = input;
      // Use input overrides if provided, otherwise fall back to global CONTEXT
      const ws = workspaceKey ?? CONTEXT.workspaceKey;
      const sp = serviceProvider ?? CONTEXT.serviceProvider;
      const headers = {
        ...(ws ? { "x-workspace-key": ws } : {}),
        ...(sp ? { "x-service-provider": String(sp).toUpperCase() } : {}),
      };
      const data = await invokeSlug({
        slug,
        method,
        path,
        pathParams,
        query,
        body,
        headers,
      });
      sendResult(id, data);
      return;
    }
    sendError(
      id,
      -32601,
      `Unknown tool '${name}'. Use tools/list to see available tools.`
    );
  } catch (err) {
    sendError(id, -32000, err.message);
  }
}

async function handleResourcesGet(id, params) {
  await ENDPOINTS_PROMISE;
  const uri = params?.uri;
  const resources = {
    "resource://zapmail/llms": ENDPOINTS.map((e) => e.slug).join("\n"),
    "resource://zapmail/prompts/name_generation": NAME_GENERATION_PROMPT,
    "resource://zapmail/prompts/pair_generation": PAIR_GENERATION_PROMPT,
    "resource://zapmail/prompts/gender_ethnicity_detection":
      GENDER_ETHNICITY_DETECTION_PROMPT,
    "resource://zapmail/prompts/domain_generation": DOMAIN_GENERATION_PROMPT,
    "resource://zapmail/examples/nl": EXAMPLES_NL,
  };
  if (uri in resources) {
    sendResult(id, { uri, mimeType: "text/plain", text: resources[uri] });
  } else {
    sendError(id, -32601, `Unknown resource '${uri}'.`);
  }
}

// Prompts (from user)
const NAME_GENERATION_PROMPT = `You are an AI Name Generator specialized in creating professional names for email addresses.
Follow every rule exactly and output ONLY the JSON specified in rule 4.

1. INPUT PLACEHOLDERS  
   • {NAME} – The person's name (may contain first and last name)  
   • {NUMBER_OF_NAMES} – Number of names to generate (CRITICAL: Generate EXACTLY this many names)  
   
2. NAME CREATION APPROACH  
   • Generate EXACTLY {NUMBER_OF_NAMES} unique name combinations
   • If the name contains both first and last name (e.g., "alan dsouza"):
     - The "firstname" field in all entries must contain only the first name (e.g., "Alan")
     - The "lastname" field must contain only the last name (e.g., "Dsouza")
     - The **first username generated** MUST be the first name only (e.g., "alan")
     - The remaining usernames should follow these professional patterns:
       - First + last: alandsouza
       - First.last: alan.dsouza
       - First_last: alan_dsouza
       - F.last: a.dsouza
       - First.l: alan.d
       - L.first: dsouza.alan
       - Firstname.l: alan.d
       - First.lastname: alan.dsouza
       - F.lastname: a.dsouza
     - CRITICAL: Do NOT add numbers to usernames for full-name inputs
   • If the name is a single word, create variations with:
     - Name as-is: name
     - Name with dots: n.a.m.e
     - Name with numbers: name1, name2
   • CRITICAL: Each username MUST be UNIQUE
   • CRITICAL: Usernames MUST be professional (e.g., firstname.lastname, firstnamelastname, f.lastname)
   • Maximum 30 characters
   • No hyphens allowed
   • Use simple numbers (1, 2, 3) only if absolutely needed and only for single-word names
   • Avoid unnecessary words or characters

3. OUTPUT FORMAT (JSON ONLY)  
{
  "names": [
    {
      "firstname": "Alan",
      "lastname": "Dsouza", 
      "username": "alan"
    },
    {
      "firstname": "Alan",
      "lastname": "Dsouza",
      "username": "alan.dsouza"
    },
    {
      "firstname": "Alan",
      "lastname": "Dsouza",
      "username": "a.dsouza"
    },
    {
      "firstname": "Alan",
      "lastname": "Dsouza",
      "username": "alan.d"
    },
    {
      "firstname": "Alan",
      "lastname": "Dsouza",
      "username": "dsouza.alan"
    }
  ],
  "note": "Generated {NUMBER_OF_NAMES} suggestions"
}

Your ONLY job is to generate unique, professional names WITHOUT any scoring or analysis.
CRITICAL: Generate EXACTLY {NUMBER_OF_NAMES} names - no more, no less.
CRITICAL: The first username must be just the first name (e.g., "alan") if a full name is given.
CRITICAL: Follow the EXACT username patterns shown above. Do NOT add numbers to usernames unless it's a single-name input.
CRITICAL: The "names" array must contain exactly {NUMBER_OF_NAMES} items.`;

const PAIR_GENERATION_PROMPT = `
Generate EXACTLY {NUMBER_OF_NAMES} unique, culturally appropriate firstname and lastname pairs for {ETHNICITY} ethnicity and {GENDER} gender. 

Return JSON ONLY in this format:

{
  "names": [
    { "firstname": "ExampleFirstName", "lastname": "ExampleLastName" }
  ]
}

CRITICAL RULES:
- Generate exactly {NUMBER_OF_NAMES} pairs, no more, no less.
- Never leave firstname or lastname blank.
- Never explain or add text outside JSON.
`;

const GENDER_ETHNICITY_DETECTION_PROMPT = `
Analyze the given name and determine the most likely gender and ethnicity/cultural background.

Name: {NAME}

Return ONLY a JSON response in this exact format:

{
  "gender": "male" | "female" | "neutral",
  "ethnicity": ["primary ethnicity", "secondary ethnicity if applicable"],
  "confidence": 0.85
}

Rules:
1. Gender should be "male", "female", or "neutral" (if uncertain or unisex)
2. Ethnicity should be an array with the most likely cultural/ethnic backgrounds
3. Use common ethnicity categories like: "European", "South Asian", "East Asian", "Middle Eastern", "African", "Hispanic/Latino", "Native American", etc.
4. Confidence should be a number between 0 and 1 indicating how certain you are
5. If the name could belong to multiple ethnicities, list up to 2 most likely ones
6. Return ONLY the JSON, no explanations
`;

const DOMAIN_GENERATION_PROMPT = `You are an AI Domain Name Generator specialized in cold-outreach.
Follow every rule exactly and output ONLY the JSON specified in rule 5.

:warning: HARD RULES:
- You MUST generate **exactly {MAX_COUNT} unique domain names**, including **base names and TLDs**.
- **Base names should be in lowercase** and should include the TLD from the provided list.
- Base names must be **brandable**, **professional**, and relevant to the provided keywords.
- **Do NOT generate short, meaningless names**.
- The names should be **pronounceable**, **easy to remember**, and **short** (no more than 15 characters before TLD).
- The names should be **descriptive** and related to the keywords provided.
- NEVER include multiple identical base names across the TLDs.
- Use the provided TLDs {TLDS} and combine them with unique base names to form domain names.

1. INPUT PLACEHOLDERS:
   • {KEYWORDS} – Comma-separated keywords or variants (already processed)
   • {EXCLUDE_DOMAINS} – Domains to exclude (already owned by user)
   • {TLDS} – Comma-separated list of TLDs to use (e.g., .com, .ai, .net)

2. RULES FOR NAME CREATION:
   • Treat each keyword in {KEYWORDS} independently.
   • For each base keyword, generate domain names by combining it with the TLDs in {TLDS}.
   • Avoid **repeating the same base name with multiple TLDs**.
   • Base names should be meaningful and professional.
   • Avoid non-pronounceable, random names.
   • The base names should convey the **purpose**.
   • No hyphens, digits, or special characters allowed.

3. DISTRIBUTION:
   • Divide the total of **{MAX_COUNT}** domain names **evenly** among all keywords.
   • Avoid duplicates across all keywords and ensure unique names.
   • Stop immediately after generating **{MAX_COUNT} unique domain names**.

4. OUTPUT FORMAT (JSON ONLY):
{
  "domains": [
    "brandname1.com",
    "brandname2.ai",
    "brandname3.io"
  ]
}

:x: If you generate more than {MAX_COUNT} names or fail to meet these quality expectations, the response is INVALID.`;

const EXAMPLES_NL = `
Examples (natural language -> plan):

## Workspace & Domain Management
1) "List all my workspaces"
2) "Show domains in current workspace containing 'lead'"
3) "Check if leadconnectlab.com is available for 2 years"
4) "Buy leadconnectlab.com and outreachprohub.com for 1 year using wallet if possible"

## Mailbox Management
5) "Create 3 mailboxes per domain where there are zero mailboxes"
6) "Setup 100 mailboxes and connect to Instantly.ai for me"

## Export Operations (NEW)
7) "Export all mailboxes to reachinbox"
8) "Export mailboxes to instantly"
9) "Export mailboxes to smartlead"
10) "Export mailboxes to reply.io"
11) "Export mailboxes as CSV"
12) "Export specific mailboxes"
13) "Export mailboxes from leadconnectio.com domain"
14) "Download all mailboxes as CSV file"

## Third-Party Integration
15) "Connect reachinbox account"
16) "Add instantly credentials"
17) "Link smartlead account"
18) "Setup reply.io integration"

## Complex Export Workflows (NEW)
19) "Create 3 mailboxes on empty domains and export to reachinbox"
20) "Buy example.com, create 5 mailboxes, and connect to instantly"
21) "Export all active mailboxes from leadconnectio.com to reachinbox"
22) "Export specific mailboxes to reachinbox with credentials"

## Export Best Practices (NEW)
- Always provide credentials for direct integration exports
- Use specific filters to export only needed mailboxes
- Export in batches for large numbers of mailboxes
- Test with small subsets before full exports
- Monitor export status and verify successful import
`;

// ---------------------------------------------------------------------------
// Main JSON-RPC loop
// ---------------------------------------------------------------------------

let buffer = "";
stdin.setEncoding("utf8");
stdin.on("data", (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (err) {
      stderr.write(`Invalid JSON: ${line}\n`);
      continue;
    }
    const { id, method, params } = msg;
    if (method === "tools/list") {
      handleToolsList(id);
    } else if (method === "tools/invoke") {
      handleToolsInvoke(id, params);
    } else if (method === "resources/get") {
      handleResourcesGet(id, params);
    } else {
      sendError(id, -32601, `Unknown method '${method}'.`);
    }
  }
});
