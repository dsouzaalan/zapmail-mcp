# Zapmail MCP Server

A Model Context Protocol (MCP) server for the Zapmail API that provides natural language access to domain management, mailbox operations, and exports. This package enables AI assistants like Claude to interact with Zapmail through natural language commands.

## Features

- Complete Zapmail API coverage (46+ tools)
- Natural language command processing
- Dynamic tool generation from API documentation
- Export support for Reachinbox, Instantly, Smartlead, Reply.io, and CSV
- Caching system with TTL
- Rate limiting and error handling
- Multi-workspace support
- MCP integration with Claude Desktop and Cursor

## Prerequisites

- Node.js 18+
- Zapmail API key
- MCP-compatible client (Claude Desktop, Cursor, etc.)
- Optional: OpenAI API key for enhanced natural language processing

## Installation

### Option 1: Using npx (Recommended)

No installation required - run directly with npx:

```bash
npx zapmail-mcp
```

### Option 2: Global Installation

Install globally for persistent access:

```bash
npm install -g zapmail-mcp
```

## MCP Configuration

### For Claude Desktop

Create or update `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

**Using npx (Recommended):**

```json
{
  "mcpServers": {
    "zapmail": {
      "command": "npx",
      "args": ["zapmail-mcp"],
      "env": {
        "ZAPMAIL_API_KEY": "your-zapmail-api-key"
      }
    }
  }
}
```

**Using global installation:**

```json
{
  "mcpServers": {
    "zapmail": {
      "command": "zapmail-mcp",
      "args": [],
      "env": {
        "ZAPMAIL_API_KEY": "your-zapmail-api-key"
      }
    }
  }
}
```

### For Cursor

Add to your Cursor MCP settings:

**Using npx (Recommended):**

```json
{
  "mcpServers": {
    "zapmail": {
      "command": "npx",
      "args": ["zapmail-mcp"],
      "env": {
        "ZAPMAIL_API_KEY": "your-zapmail-api-key"
      }
    }
  }
}
```

**Using global installation:**

```json
{
  "mcpServers": {
    "zapmail": {
      "command": "zapmail-mcp",
      "args": [],
      "env": {
        "ZAPMAIL_API_KEY": "your-zapmail-api-key"
      }
    }
  }
}
```

## Quick Start

1. **Get your Zapmail API key:**

   - Sign up at [Zapmail](https://zapmail.ai)
   - Navigate to your API settings
   - Generate a new API key

2. **Configure your MCP client:**

   - Choose your preferred MCP client (Claude Desktop or Cursor)
   - Add the configuration JSON above to your MCP settings
   - Replace `your-zapmail-api-key` with your actual API key

3. **Test the connection:**
   - Open your MCP client
   - Try natural language commands like:
     - "List all my Zapmail workspaces"
     - "Show me my domains"
     - "Check if example.com is available for purchase"

## Available Tools

### Core Management Tools

- `set_context` - Set workspace and provider context
- `wallet_balance` - Get wallet balance
- `list_workspaces` - List all workspaces
- `list_domains` - List domains in workspace
- `check_domain_availability` - Check domain availability
- `purchase_domains` - Purchase domains (wallet-first)
- `create_mailboxes_for_zero_domains` - Create mailboxes on empty domains
- `add_third_party_account` - Add third-party export account
- `call_endpoint` - Call any Zapmail endpoint
- `generate_usernames` - Generate mailbox usernames
- `generate_name_pairs` - Generate name pairs
- `generate_domains` - Generate AI-powered domain suggestions
- `check_domain_availability_batch` - Batch domain availability check
- `plan_and_execute` - Natural-language plan & execute
- `get_server_info` - Get server information

### System Management Tools

- `get_metrics` - Get system metrics and performance data
- `clear_cache` - Clear system cache
- `health_check` - System health check

### Advanced Mailbox Tools

- `bulk_update_mailboxes` - Bulk update mailboxes
- `search_mailboxes` - Search mailboxes with advanced filters

### Export System Tools

- `get_export_info` - Get export system information
- `get_export_scenario` - Get export scenario instructions
- `validate_export_request` - Validate export request parameters
- `export_guidance` - Get export guidance and best practices

### API Documentation Tools

- `get_api_info` - Get comprehensive API endpoint information
- `search_api_endpoints` - Search API endpoints by keyword
- `get_api_scenarios` - Get common API usage scenarios
- `get_api_best_practices` - Get API best practices and recommendations
- `generate_api_examples` - Generate API usage examples

### Dynamic API Tools

All documented API endpoints with automatic tool generation

## Natural Language Commands

Once connected to your MCP client, you can use natural language to control Zapmail:

### Workspace & Domain Management

- "List all my workspaces"
- "Show domains in current workspace containing 'lead'"
- "Check if leadconnectlab.com is available for 2 years"
- "Buy leadconnectlab.com and outreachprohub.com for 1 year using wallet if possible"

### Mailbox Management

- "Create 3 mailboxes per domain where there are zero mailboxes"
- "Setup 100 mailboxes and connect to Instantly.ai for me"
- "Update all mailboxes with new names"

### Export Operations

- "Export all mailboxes to reachinbox"
- "Export mailboxes to instantly"
- "Export mailboxes as CSV"
- "Export specific mailboxes"
- "Export mailboxes from leadconnectio.com domain"

### Third-Party Integration

- "Connect reachinbox account"
- "Add instantly credentials"
- "Link smartlead account"
- "Setup reply.io integration"

## Configuration

### Environment Variables

| Variable                   | Description                           | Default | Required |
| -------------------------- | ------------------------------------- | ------- | -------- |
| `ZAPMAIL_API_KEY`          | Your Zapmail API key                  | -       | Yes      |
| `ZAPMAIL_WORKSPACE_KEY`    | Default workspace ID                  | -       | No       |
| `ZAPMAIL_SERVICE_PROVIDER` | Email provider (GOOGLE/MICROSOFT)     | GOOGLE  | No       |
| `ZAPMAIL_LOG_LEVEL`        | Logging level (DEBUG/INFO/WARN/ERROR) | INFO    | No       |
| `ZAPMAIL_MAX_RETRIES`      | Maximum retry attempts                | 3       | No       |
| `ZAPMAIL_TIMEOUT_MS`       | Request timeout in milliseconds       | 30000   | No       |
| `ZAPMAIL_ENABLE_CACHE`     | Enable response caching               | true    | No       |
| `ZAPMAIL_ENABLE_METRICS`   | Enable performance metrics            | true    | No       |
| `ZAPMAIL_RATE_LIMIT_DELAY` | Rate limiting delay in ms             | 1000    | No       |
| `OPENAI_API_KEY`           | OpenAI API key for enhanced NLP       | -       | No       |

## Usage Examples

### Domain Operations

#### Check Domain Availability

**In Claude Desktop or Cursor:**

```
"Check if example.com is available for 1 year"
```

#### Purchase Domains

**In Claude Desktop or Cursor:**

```
"Buy example.com and test.com for 1 year using wallet if possible"
```

### Mailbox Management

#### Create Mailboxes on Empty Domains

**In Claude Desktop or Cursor:**

```
"Create 5 mailboxes on domains that have zero mailboxes"
```

#### Bulk Update Mailboxes

**In Claude Desktop or Cursor:**

```
"Update all mailboxes with new names and details"
```

### Export Operations

#### Export to Reachinbox

**In Claude Desktop or Cursor:**

```
"Connect my Reachinbox account and export all mailboxes"
```

#### Get Export Guidance

**In Claude Desktop or Cursor:**

```
"Help me export 100 mailboxes to Reachinbox"
```

### Complex Workflows

#### Multi-Step Operations

**In Claude Desktop or Cursor:**

```
"Buy example.com and test.com, create 5 mailboxes on each, and export to reachinbox"
```

#### Workspace Management

**In Claude Desktop or Cursor:**

```
"Show me all my workspaces and switch to the one with the most domains"
```

### System Monitoring

#### Health Check

**In Claude Desktop or Cursor:**

```
"Check the health of my Zapmail connection"
```

#### Get Metrics

**In Claude Desktop or Cursor:**

```
"Show me performance metrics for my Zapmail operations"
```

## Troubleshooting

### MCP Connection Issues

#### 1. MCP Server Not Found

**Problem**: "zapmail-mcp command not found" or "npx zapmail-mcp not found"
**Solutions**:

**For npx usage:**

```bash
# Test npx directly
npx zapmail-mcp --version

# If npx fails, try with explicit package version
npx zapmail-mcp@latest --version

# Get help information
npx zapmail-mcp --help
```

**For global installation:**

```bash
# Install the package globally
npm install -g zapmail-mcp

# Verify installation
zapmail-mcp --version
```

#### 2. MCP Client Not Detecting Server

**Problem**: Zapmail tools not appearing in Claude Desktop/Cursor
**Solutions**:

- Restart your MCP client (Claude Desktop/Cursor)
- Check your MCP configuration file syntax
- Verify the command path in your config

#### 3. API Key Issues

**Problem**: "ZAPMAIL_API_KEY not configured"
**Solutions**:

- Set environment variable in your MCP config:

```json
{
  "mcpServers": {
    "zapmail": {
      "command": "npx",
      "args": ["zapmail-mcp"],
      "env": {
        "ZAPMAIL_API_KEY": "your-api-key"
      }
    }
  }
}
```

- Or set globally:

```bash
export ZAPMAIL_API_KEY="your-api-key"
```

#### 4. Workspace Context Issues

**Problem**: Getting data from wrong workspace
**Solution**: Set workspace in MCP config:

```json
{
  "env": {
    "ZAPMAIL_WORKSPACE_KEY": "your-workspace-id"
  }
}
```

### Performance Issues

#### 1. Slow Response Times

**Problem**: MCP operations taking too long
**Solutions**:

- Enable caching: `ZAPMAIL_ENABLE_CACHE="true"`
- Increase rate limit delay: `ZAPMAIL_RATE_LIMIT_DELAY="2000"`
- Check your internet connection

#### 2. Rate Limiting

**Problem**: "Too many requests" errors
**Solution**: Increase rate limit delay in MCP config:

```json
{
  "env": {
    "ZAPMAIL_RATE_LIMIT_DELAY": "2000"
  }
}
```

### Debug Mode

Enable debug logging for detailed troubleshooting:

```json
{
  "env": {
    "ZAPMAIL_LOG_LEVEL": "DEBUG"
  }
}
```

### Health Check

Test your MCP connection:
**In Claude Desktop or Cursor:**

```
"Check the health of my Zapmail connection"
```

### Common MCP Configuration Errors

#### 1. Invalid JSON Syntax

**Problem**: MCP client fails to load configuration
**Solution**: Validate your JSON configuration using a JSON validator

#### 2. Wrong Command Path

**Problem**: "Command not found" in MCP client
**Solution**: Use full path or ensure `zapmail-mcp` is in your PATH

#### 3. Environment Variables Not Loading

**Problem**: API key not being passed to MCP server
**Solution**: Use the `env` section in your MCP configuration instead of global environment variables

## Getting Started with MCP

### Step 1: Install the Package

**Option A: Using npx (Recommended)**
No installation needed - just use npx:

```bash
npx zapmail-mcp
```

**Option B: Global Installation**

```bash
npm install -g zapmail-mcp
```

### Step 2: Get Your Zapmail API Key

1. Sign up at [Zapmail](https://zapmail.ai)
2. Navigate to your API settings
3. Generate a new API key
4. Note your workspace ID (optional but recommended)

### Step 3: Configure Your MCP Client

Choose your preferred MCP client and follow the configuration steps above.

### Step 4: Test the Connection

Open your MCP client and try a simple command:

- "List my Zapmail workspaces"
- "Show me my domains"

### Step 5: Explore Advanced Features

Once connected, you can:

- Manage domains and mailboxes through natural language
- Export to third-party platforms
- Set up complex automation workflows
- Monitor performance and health

## Package Information

- **Package Name**: `zapmail-mcp`
- **Version**: 0.0.2
- **NPM**: [zapmail-mcp](https://www.npmjs.com/package/zapmail-mcp)
- **GitHub**: [dsouzaalan/zapmail-mcp](https://github.com/dsouzaalan/zapmail-mcp)
- **License**: MIT

## Command Line Options

The MCP server supports the following command-line options:

### Version Information

```bash
npx zapmail-mcp --version
# or
npx zapmail-mcp -v
```

### Help Information

```bash
npx zapmail-mcp --help
# or
npx zapmail-mcp -h
```

## Support

For support and questions:

- Check the troubleshooting section above
- Review the MCP configuration examples
- Test your connection with health checks
- Enable debug logging for detailed error information
- Visit the [GitHub repository](https://github.com/dsouzaalan/zapmail-mcp) for issues and discussions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**Made with ❤️ for the Zapmail community**
