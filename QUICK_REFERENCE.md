# Zapmail MCP Server - Quick Reference Card

## 🚀 Quick Start Commands

### Start Server
```bash
export ZAPMAIL_API_KEY="your-api-key"
node index.js
```

### Test Connection
```bash
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/invoke", "params": {"tool_name": "health_check", "input": {}}}' | node index.js
```

## 📋 Basic Operations

### List Tools
```bash
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}' | node index.js
```

### List Workspaces
```bash
echo '{"jsonrpc": "2.0", "id": 2, "method": "tools/invoke", "params": {"tool_name": "list_workspaces", "input": {}}}' | node index.js
```

### Set Context
```bash
echo '{"jsonrpc": "2.0", "id": 3, "method": "tools/invoke", "params": {"tool_name": "set_context", "input": {"workspaceKey": "your-workspace-id", "serviceProvider": "GOOGLE"}}}' | node index.js
```

### List Domains
```bash
echo '{"jsonrpc": "2.0", "id": 4, "method": "tools/invoke", "params": {"tool_name": "list_domains", "input": {}}}' | node index.js
```

## 🌐 Domain Operations

### Check Availability
```bash
echo '{"jsonrpc": "2.0", "id": 5, "method": "tools/invoke", "params": {"tool_name": "check_domain_availability", "input": {"domainName": "example.com", "years": 1}}}' | node index.js
```

### Purchase Domains
```bash
echo '{"jsonrpc": "2.0", "id": 6, "method": "tools/invoke", "params": {"tool_name": "purchase_domains", "input": {"domains": ["example.com", "test.com"], "years": 1, "preferWallet": true}}}' | node index.js
```

### Natural Language Domain Purchase
```bash
echo '{"jsonrpc": "2.0", "id": 7, "method": "tools/invoke", "params": {"tool_name": "plan_and_execute", "input": {"instruction": "buy example.com and test.com for 1 year", "execute": false}}}' | node index.js
```

## 📧 Mailbox Operations

### Create Mailboxes on Empty Domains
```bash
echo '{"jsonrpc": "2.0", "id": 8, "method": "tools/invoke", "params": {"tool_name": "create_mailboxes_for_zero_domains", "input": {"countPerDomain": 3}}}' | node index.js
```

### Generate Usernames
```bash
echo '{"jsonrpc": "2.0", "id": 9, "method": "tools/invoke", "params": {"tool_name": "generate_usernames", "input": {"name": "John Doe", "numberOfNames": 5}}}' | node index.js
```

### Bulk Update Mailboxes
```bash
echo '{"jsonrpc": "2.0", "id": 10, "method": "tools/invoke", "params": {"tool_name": "bulk_update_mailboxes", "input": {"updates": [{"mailboxId": "mb_123", "firstName": "John", "lastName": "Doe"}]}}}' | node index.js
```

### Search Mailboxes
```bash
echo '{"jsonrpc": "2.0", "id": 11, "method": "tools/invoke", "params": {"tool_name": "search_mailboxes", "input": {"firstName": "John", "status": "ACTIVE"}}}' | node index.js
```

## 📤 Export Operations

### Add Third-Party Account
```bash
echo '{"jsonrpc": "2.0", "id": 12, "method": "tools/invoke", "params": {"tool_name": "add_third_party_account", "input": {"email": "user@reachinbox.com", "password": "password", "app": "REACHINBOX"}}}' | node index.js
```

### Get Export Info
```bash
echo '{"jsonrpc": "2.0", "id": 13, "method": "tools/invoke", "params": {"tool_name": "get_export_info", "input": {"platform": "REACHINBOX"}}}' | node index.js
```

### Natural Language Export
```bash
echo '{"jsonrpc": "2.0", "id": 14, "method": "tools/invoke", "params": {"tool_name": "plan_and_execute", "input": {"instruction": "export all mailboxes to reachinbox", "execute": false}}}' | node index.js
```

## 💰 Wallet Operations

### Check Balance
```bash
echo '{"jsonrpc": "2.0", "id": 15, "method": "tools/invoke", "params": {"tool_name": "wallet_balance", "input": {}}}' | node index.js
```

## 🎯 Natural Language Commands

### Basic Commands
```bash
"list all workspaces"
"show domains in current workspace"
"check if example.com is available"
"buy example.com and test.com"
"create 3 mailboxes on empty domains"
```

### Export Commands
```bash
"export all mailboxes to reachinbox"
"export mailboxes to instantly"
"export mailboxes as CSV"
"connect reachinbox account"
```

### Complex Workflows
```bash
"Buy example.com and test.com, create 5 mailboxes on each, and export to reachinbox"
"Create 3 mailboxes on all empty domains, update their names, and export to instantly"
```

## 🔍 System Management

### Health Check
```bash
echo '{"jsonrpc": "2.0", "id": 16, "method": "tools/invoke", "params": {"tool_name": "health_check", "input": {"detailed": true}}}' | node index.js
```

### Get Metrics
```bash
echo '{"jsonrpc": "2.0", "id": 17, "method": "tools/invoke", "params": {"tool_name": "get_metrics", "input": {"includeCache": true, "includeTimers": true, "includeCounters": true}}}' | node index.js
```

### Clear Cache
```bash
echo '{"jsonrpc": "2.0", "id": 18, "method": "tools/invoke", "params": {"tool_name": "clear_cache", "input": {"confirm": true}}}' | node index.js
```

### Get Server Info
```bash
echo '{"jsonrpc": "2.0", "id": 19, "method": "tools/invoke", "params": {"tool_name": "get_server_info", "input": {}}}' | node index.js
```

## 📚 API Documentation

### Get API Info
```bash
echo '{"jsonrpc": "2.0", "id": 20, "method": "tools/invoke", "params": {"tool_name": "get_api_info", "input": {"category": "domains"}}}' | node index.js
```

### Search Endpoints
```bash
echo '{"jsonrpc": "2.0", "id": 21, "method": "tools/invoke", "params": {"tool_name": "search_api_endpoints", "input": {"keyword": "dns"}}}' | node index.js
```

### Get Best Practices
```bash
echo '{"jsonrpc": "2.0", "id": 22, "method": "tools/invoke", "params": {"tool_name": "get_api_best_practices", "input": {"category": "mailboxes"}}}' | node index.js
```

## 🛠️ Troubleshooting

### Debug Mode
```bash
export ZAPMAIL_LOG_LEVEL="DEBUG"
node index.js
```

### Common Issues
- **API Key**: `export ZAPMAIL_API_KEY="your-key"`
- **Workspace**: `export ZAPMAIL_WORKSPACE_KEY="your-workspace"`
- **Rate Limiting**: `export ZAPMAIL_RATE_LIMIT_DELAY="2000"`

## 🔧 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ZAPMAIL_API_KEY` | API key | Required |
| `ZAPMAIL_WORKSPACE_KEY` | Workspace ID | - |
| `ZAPMAIL_SERVICE_PROVIDER` | Provider (GOOGLE/MICROSOFT) | GOOGLE |
| `ZAPMAIL_LOG_LEVEL` | Log level | INFO |
| `ZAPMAIL_ENABLE_CACHE` | Enable caching | true |
| `ZAPMAIL_ENABLE_METRICS` | Enable metrics | true |

## 📊 Supported Platforms

- **Reachinbox** - Email outreach platform
- **Instantly** - Cold email automation
- **Smartlead** - Email automation
- **Reply.io** - Sales engagement
- **Manual** - CSV/JSON export

## 🎯 Quick Workflows

### 1. New Domain Setup
```bash
# Check availability
echo '{"jsonrpc": "2.0", "id": 23, "method": "tools/invoke", "params": {"tool_name": "plan_and_execute", "input": {"instruction": "check if example.com is available for 2 years", "execute": false}}}' | node index.js

# Purchase and setup
echo '{"jsonrpc": "2.0", "id": 24, "method": "tools/invoke", "params": {"tool_name": "plan_and_execute", "input": {"instruction": "buy example.com, create 5 mailboxes, export to reachinbox", "execute": false}}}' | node index.js
```

### 2. Bulk Mailbox Management
```bash
echo '{"jsonrpc": "2.0", "id": 25, "method": "tools/invoke", "params": {"tool_name": "plan_and_execute", "input": {"instruction": "create 3 mailboxes on all empty domains and export to instantly", "execute": false}}}' | node index.js
```

### 3. Export Workflow
```bash
echo '{"jsonrpc": "2.0", "id": 26, "method": "tools/invoke", "params": {"tool_name": "plan_and_execute", "input": {"instruction": "export all active mailboxes from leadconnectio.com to reachinbox", "execute": false}}}' | node index.js
```

---

**💡 Tip**: Use `"execute": false` for dry runs to see what would happen before actually executing commands.
