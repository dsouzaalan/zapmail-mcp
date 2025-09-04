# Zapmail MCP Server

A comprehensive Model Context Protocol (MCP) server for the Zapmail API, providing natural language access to all Zapmail features including domain management, mailbox operations, exports, and more.

## 🚀 Features

### Core Capabilities
- **Complete API Coverage**: All documented Zapmail endpoints
- **Natural Language Processing**: Human-readable commands and instructions
- **Dynamic Tool Generation**: Automatic tool creation from API documentation
- **Comprehensive Documentation**: Detailed guides for all API operations
- **Export System**: Support for Reachinbox, Instantly, Smartlead, Reply.io, and manual exports

### Advanced Features
- **Caching System**: LRU cache with TTL for improved performance
- **Rate Limiting**: Configurable request throttling
- **Metrics & Monitoring**: Performance tracking and health checks
- **Error Handling**: Robust error recovery and graceful degradation
- **Workspace Management**: Multi-workspace support with context switching

## 📋 Prerequisites

- Node.js 18+ (for global fetch support)
- Zapmail API key
- Optional: OpenAI API key (for enhanced natural language processing)

## 🛠️ Installation

### 1. Clone the Repository
```bash
git clone <repository-url>
cd zapmail-mcp-nl
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a `.env` file or set environment variables:

```bash
# Required
export ZAPMAIL_API_KEY="your-zapmail-api-key"

# Optional but recommended
export ZAPMAIL_WORKSPACE_KEY="your-workspace-id"
export ZAPMAIL_SERVICE_PROVIDER="GOOGLE"  # or "MICROSOFT"
export ZAPMAIL_LOG_LEVEL="INFO"
export ZAPMAIL_ENABLE_METRICS="true"
export ZAPMAIL_ENABLE_CACHE="true"

# Optional: Enhanced natural language processing
export OPENAI_API_KEY="your-openai-api-key"
```

## 🚀 Quick Start

### 1. Start the MCP Server
```bash
node index.js
```

### 2. Test Basic Functionality
```bash
# Test server health
curl -X POST http://localhost:3000/health

# List available tools
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}' | node index.js
```

### 3. Basic Usage Examples

#### List Workspaces
```bash
echo '{"jsonrpc": "2.0", "id": 2, "method": "tools/invoke", "params": {"tool_name": "list_workspaces", "input": {}}}' | node index.js
```

#### Natural Language Commands
```bash
echo '{"jsonrpc": "2.0", "id": 3, "method": "tools/invoke", "params": {"tool_name": "plan_and_execute", "input": {"instruction": "list all workspaces", "execute": false}}}' | node index.js
```

## 📚 API Categories

The MCP server provides access to 9 comprehensive API categories:

### 1. User Management
- Get user details and account information
- Check plan limits and features

### 2. Workspace Management
- List, create, and update workspaces
- Switch between different projects

### 3. Domain Management (15 endpoints)
- Domain registration and availability checking
- DNS configuration and email authentication
- Domain forwarding and catch-all setup
- Google OAuth integration

### 4. Mailbox Management (6 endpoints)
- Create and manage mailboxes
- Bulk operations and updates
- Two-factor authentication setup
- Mailbox lifecycle management

### 5. Wallet Management (3 endpoints)
- Check wallet balance
- Add funds to wallet
- Configure auto-recharge

### 6. Export System (2 endpoints)
- Export mailboxes to third-party platforms
- Add third-party account credentials

### 7. Billing Management (2 endpoints)
- Add and update billing details
- Manage payment methods

### 8. Subscription Management (3 endpoints)
- View and manage subscriptions
- Upgrade and cancel plans

### 9. DNS Management (4 endpoints)
- Manage DNS records
- Configure email authentication (SPF, DKIM, DMARC)

## 🎯 Natural Language Commands

The MCP server understands natural language instructions:

### Workspace & Domain Management
```bash
"List all my workspaces"
"Show domains in current workspace containing 'lead'"
"Check if leadconnectlab.com is available for 2 years"
"Buy leadconnectlab.com and outreachprohub.com for 1 year using wallet if possible"
```

### Mailbox Management
```bash
"Create 3 mailboxes per domain where there are zero mailboxes"
"Setup 100 mailboxes and connect to Instantly.ai for me"
```

### Export Operations
```bash
"Export all mailboxes to reachinbox"
"Export mailboxes to instantly"
"Export mailboxes as CSV"
"Export specific mailboxes"
"Export mailboxes from leadconnectio.com domain"
```

### Third-Party Integration
```bash
"Connect reachinbox account"
"Add instantly credentials"
"Link smartlead account"
"Setup reply.io integration"
```

## 🔧 Configuration Options

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ZAPMAIL_API_KEY` | Your Zapmail API key | - | ✅ |
| `ZAPMAIL_WORKSPACE_KEY` | Default workspace ID | - | ❌ |
| `ZAPMAIL_SERVICE_PROVIDER` | Email provider (GOOGLE/MICROSOFT) | GOOGLE | ❌ |
| `ZAPMAIL_LOG_LEVEL` | Logging level (DEBUG/INFO/WARN/ERROR) | INFO | ❌ |
| `ZAPMAIL_MAX_RETRIES` | Maximum retry attempts | 3 | ❌ |
| `ZAPMAIL_TIMEOUT_MS` | Request timeout in milliseconds | 30000 | ❌ |
| `ZAPMAIL_ENABLE_CACHE` | Enable response caching | true | ❌ |
| `ZAPMAIL_ENABLE_METRICS` | Enable performance metrics | true | ❌ |
| `ZAPMAIL_RATE_LIMIT_DELAY` | Rate limiting delay in ms | 1000 | ❌ |
| `OPENAI_API_KEY` | OpenAI API key for enhanced NLP | - | ❌ |

### Advanced Configuration

#### Caching
```bash
export ZAPMAIL_ENABLE_CACHE="true"
export ZAPMAIL_CACHE_TTL="300000"  # 5 minutes
export ZAPMAIL_CACHE_MAX_SIZE="1000"
```

#### Rate Limiting
```bash
export ZAPMAIL_RATE_LIMIT_DELAY="1000"  # 1 second between requests
```

#### Logging
```bash
export ZAPMAIL_LOG_LEVEL="DEBUG"  # For detailed debugging
```

## 🛠️ Available Tools

### Core Management Tools (15)
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

### System Management Tools (3)
- `get_metrics` - Get system metrics and performance data
- `clear_cache` - Clear system cache
- `health_check` - System health check

### Advanced Mailbox Tools (2)
- `bulk_update_mailboxes` - Bulk update mailboxes
- `search_mailboxes` - Search mailboxes with advanced filters

### Export System Tools (4)
- `get_export_info` - Get export system information
- `get_export_scenario` - Get export scenario instructions
- `validate_export_request` - Validate export request parameters
- `export_guidance` - Get export guidance and best practices

### API Documentation Tools (5)
- `get_api_info` - Get comprehensive API endpoint information
- `search_api_endpoints` - Search API endpoints by keyword
- `get_api_scenarios` - Get common API usage scenarios
- `get_api_best_practices` - Get API best practices and recommendations
- `generate_api_examples` - Generate API usage examples

### Dynamic API Tools (46)
All documented API endpoints with automatic tool generation

## 📖 Usage Examples

### 1. Basic Domain Operations

#### Check Domain Availability
```bash
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/invoke", "params": {"tool_name": "check_domain_availability", "input": {"domainName": "example.com", "years": 1}}}' | node index.js
```

#### Purchase Domains
```bash
echo '{"jsonrpc": "2.0", "id": 2, "method": "tools/invoke", "params": {"tool_name": "purchase_domains", "input": {"domains": ["example.com", "test.com"], "years": 1, "preferWallet": true}}}' | node index.js
```

### 2. Mailbox Management

#### Create Mailboxes on Empty Domains
```bash
echo '{"jsonrpc": "2.0", "id": 3, "method": "tools/invoke", "params": {"tool_name": "create_mailboxes_for_zero_domains", "input": {"countPerDomain": 5}}}' | node index.js
```

#### Bulk Update Mailboxes
```bash
echo '{"jsonrpc": "2.0", "id": 4, "method": "tools/invoke", "params": {"tool_name": "bulk_update_mailboxes", "input": {"updates": [{"mailboxId": "mb_123", "firstName": "John", "lastName": "Doe"}]}}}' | node index.js
```

### 3. Export Operations

#### Export to Reachinbox
```bash
echo '{"jsonrpc": "2.0", "id": 5, "method": "tools/invoke", "params": {"tool_name": "add_third_party_account", "input": {"email": "user@reachinbox.com", "password": "password", "app": "REACHINBOX"}}}' | node index.js
```

#### Get Export Guidance
```bash
echo '{"jsonrpc": "2.0", "id": 6, "method": "tools/invoke", "params": {"tool_name": "export_guidance", "input": {"goal": "Export all active mailboxes to Reachinbox", "platform": "REACHINBOX", "mailboxes": 100}}}' | node index.js
```

### 4. Natural Language Processing

#### Complex Workflow
```bash
echo '{"jsonrpc": "2.0", "id": 7, "method": "tools/invoke", "params": {"tool_name": "plan_and_execute", "input": {"instruction": "Buy example.com and test.com, create 5 mailboxes on each, and export to reachinbox", "execute": false}}}' | node index.js
```

### 5. System Monitoring

#### Health Check
```bash
echo '{"jsonrpc": "2.0", "id": 8, "method": "tools/invoke", "params": {"tool_name": "health_check", "input": {"detailed": true}}}' | node index.js
```

#### Get Metrics
```bash
echo '{"jsonrpc": "2.0", "id": 9, "method": "tools/invoke", "params": {"tool_name": "get_metrics", "input": {"includeCache": true, "includeTimers": true, "includeCounters": true}}}' | node index.js
```

## 🔍 Troubleshooting

### Common Issues

#### 1. API Key Issues
**Problem**: "ZAPMAIL_API_KEY not configured"
**Solution**: Set your API key:
```bash
export ZAPMAIL_API_KEY="your-api-key"
```

#### 2. Workspace Context Issues
**Problem**: Getting data from wrong workspace
**Solution**: Set workspace context:
```bash
export ZAPMAIL_WORKSPACE_KEY="your-workspace-id"
```

#### 3. Rate Limiting
**Problem**: Too many requests
**Solution**: Increase rate limit delay:
```bash
export ZAPMAIL_RATE_LIMIT_DELAY="2000"  # 2 seconds
```

#### 4. Cache Issues
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

## 📊 Performance Optimization

### Caching Strategy
- **API Responses**: Cached for 5 minutes by default
- **Endpoint Manifest**: Cached for 1 hour
- **Documentation**: Cached for 24 hours

### Rate Limiting
- **Default**: 10 requests per minute
- **Configurable**: Adjust via `ZAPMAIL_RATE_LIMIT_DELAY`

### Memory Management
- **LRU Cache**: Automatic eviction of least-used items
- **Max Size**: 1000 cached items by default
- **TTL**: Automatic expiration of cached data

## 🔒 Security Considerations

### API Key Security
- Never commit API keys to version control
- Use environment variables for sensitive data
- Rotate API keys regularly

### Input Validation
- All inputs are validated and sanitized
- No sensitive data leaked in error messages
- Proper error handling prevents information disclosure

### Workspace Isolation
- Proper context switching between workspaces
- No cross-workspace data leakage
- Secure workspace key management

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Check the troubleshooting section above
- Review the API documentation
- Run health checks to diagnose issues
- Enable debug logging for detailed error information

## 📈 Roadmap

- [ ] Enhanced natural language processing with OpenAI
- [ ] Webhook support for real-time notifications
- [ ] Advanced analytics and reporting
- [ ] Multi-tenant support
- [ ] Plugin system for custom integrations

---

**Made with ❤️ for the Zapmail community**
