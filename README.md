# Zapmail MCP Server

A Model Context Protocol (MCP) server for the Zapmail API that provides natural language access to domain management, mailbox operations, and exports.

## Features

- Complete Zapmail API coverage
- Natural language command processing
- Dynamic tool generation from API documentation
- Export support for Reachinbox, Instantly, Smartlead, Reply.io, and CSV
- Caching system with TTL
- Rate limiting and error handling
- Multi-workspace support

## Prerequisites

- Node.js 18+
- Zapmail API key
- Optional: OpenAI API key for enhanced natural language processing

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd zapmail-mcp-nl
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
# Required
export ZAPMAIL_API_KEY="your-zapmail-api-key"

# Optional
export ZAPMAIL_WORKSPACE_KEY="your-workspace-id"
export ZAPMAIL_SERVICE_PROVIDER="GOOGLE"  # or "MICROSOFT"
export ZAPMAIL_LOG_LEVEL="INFO"
export ZAPMAIL_ENABLE_METRICS="true"
export ZAPMAIL_ENABLE_CACHE="true"
export OPENAI_API_KEY="your-openai-api-key"
```

## Quick Start

1. Start the MCP server:
```bash
node index.js
```

2. Test basic functionality:
```bash
# Test server health
curl -X POST http://localhost:3000/health

# List available tools
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}' | node index.js
```

3. Basic usage examples:
```bash
# List workspaces
echo '{"jsonrpc": "2.0", "id": 2, "method": "tools/invoke", "params": {"tool_name": "list_workspaces", "input": {}}}' | node index.js

# Natural language commands
echo '{"jsonrpc": "2.0", "id": 3, "method": "tools/invoke", "params": {"tool_name": "plan_and_execute", "input": {"instruction": "list all workspaces", "execute": false}}}' | node index.js
```

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

The server understands natural language instructions:

### Workspace & Domain Management
```
"List all my workspaces"
"Show domains in current workspace containing 'lead'"
"Check if leadconnectlab.com is available for 2 years"
"Buy leadconnectlab.com and outreachprohub.com for 1 year using wallet if possible"
```

### Mailbox Management
```
"Create 3 mailboxes per domain where there are zero mailboxes"
"Setup 100 mailboxes and connect to Instantly.ai for me"
```

### Export Operations
```
"Export all mailboxes to reachinbox"
"Export mailboxes to instantly"
"Export mailboxes as CSV"
"Export specific mailboxes"
"Export mailboxes from leadconnectio.com domain"
```

### Third-Party Integration
```
"Connect reachinbox account"
"Add instantly credentials"
"Link smartlead account"
"Setup reply.io integration"
```

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ZAPMAIL_API_KEY` | Your Zapmail API key | - | Yes |
| `ZAPMAIL_WORKSPACE_KEY` | Default workspace ID | - | No |
| `ZAPMAIL_SERVICE_PROVIDER` | Email provider (GOOGLE/MICROSOFT) | GOOGLE | No |
| `ZAPMAIL_LOG_LEVEL` | Logging level (DEBUG/INFO/WARN/ERROR) | INFO | No |
| `ZAPMAIL_MAX_RETRIES` | Maximum retry attempts | 3 | No |
| `ZAPMAIL_TIMEOUT_MS` | Request timeout in milliseconds | 30000 | No |
| `ZAPMAIL_ENABLE_CACHE` | Enable response caching | true | No |
| `ZAPMAIL_ENABLE_METRICS` | Enable performance metrics | true | No |
| `ZAPMAIL_RATE_LIMIT_DELAY` | Rate limiting delay in ms | 1000 | No |
| `OPENAI_API_KEY` | OpenAI API key for enhanced NLP | - | No |

## Usage Examples

### Domain Operations

#### Check Domain Availability
```bash
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/invoke", "params": {"tool_name": "check_domain_availability", "input": {"domainName": "example.com", "years": 1}}}' | node index.js
```

#### Purchase Domains
```bash
echo '{"jsonrpc": "2.0", "id": 2, "method": "tools/invoke", "params": {"tool_name": "purchase_domains", "input": {"domains": ["example.com", "test.com"], "years": 1, "preferWallet": true}}}' | node index.js
```

### Mailbox Management

#### Create Mailboxes on Empty Domains
```bash
echo '{"jsonrpc": "2.0", "id": 3, "method": "tools/invoke", "params": {"tool_name": "create_mailboxes_for_zero_domains", "input": {"countPerDomain": 5}}}' | node index.js
```

#### Bulk Update Mailboxes
```bash
echo '{"jsonrpc": "2.0", "id": 4, "method": "tools/invoke", "params": {"tool_name": "bulk_update_mailboxes", "input": {"updates": [{"mailboxId": "mb_123", "firstName": "John", "lastName": "Doe"}]}}}' | node index.js
```

### Export Operations

#### Export to Reachinbox
```bash
echo '{"jsonrpc": "2.0", "id": 5, "method": "tools/invoke", "params": {"tool_name": "add_third_party_account", "input": {"email": "user@reachinbox.com", "password": "password", "app": "REACHINBOX"}}}' | node index.js
```

#### Get Export Guidance
```bash
echo '{"jsonrpc": "2.0", "id": 6, "method": "tools/invoke", "params": {"tool_name": "export_guidance", "input": {"goal": "Export all active mailboxes to Reachinbox", "platform": "REACHINBOX", "mailboxes": 100}}}' | node index.js
```

### Natural Language Processing

#### Complex Workflow
```bash
echo '{"jsonrpc": "2.0", "id": 7, "method": "tools/invoke", "params": {"tool_name": "plan_and_execute", "input": {"instruction": "Buy example.com and test.com, create 5 mailboxes on each, and export to reachinbox", "execute": false}}}' | node index.js
```

### System Monitoring

#### Health Check
```bash
echo '{"jsonrpc": "2.0", "id": 8, "method": "tools/invoke", "params": {"tool_name": "health_check", "input": {"detailed": true}}}' | node index.js
```

#### Get Metrics
```bash
echo '{"jsonrpc": "2.0", "id": 9, "method": "tools/invoke", "params": {"tool_name": "get_metrics", "input": {"includeCache": true, "includeTimers": true, "includeCounters": true}}}' | node index.js
```

## Troubleshooting

### Common Issues

#### API Key Issues
**Problem**: "ZAPMAIL_API_KEY not configured"
**Solution**: Set your API key:
```bash
export ZAPMAIL_API_KEY="your-api-key"
```

#### Workspace Context Issues
**Problem**: Getting data from wrong workspace
**Solution**: Set workspace context:
```bash
export ZAPMAIL_WORKSPACE_KEY="your-workspace-id"
```

#### Rate Limiting
**Problem**: Too many requests
**Solution**: Increase rate limit delay:
```bash
export ZAPMAIL_RATE_LIMIT_DELAY="2000"  # 2 seconds
```

#### Cache Issues
**Problem**: Stale data
**Solution**: Clear cache:
```bash
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/invoke", "params": {"tool_name": "clear_cache", "input": {"confirm": true}}}' | node index.js
```

### Debug Mode

Enable debug logging for detailed troubleshooting:
```bash
export ZAPMAIL_LOG_LEVEL="DEBUG"
node index.js
```

### Health Check

Run a comprehensive health check:
```bash
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/invoke", "params": {"tool_name": "health_check", "input": {"detailed": true}}}' | node index.js
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
