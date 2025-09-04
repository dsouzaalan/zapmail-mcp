# Zapmail MCP Server - Step-by-Step Guide

This guide will walk you through setting up and using the Zapmail MCP server from scratch.

## 📋 Prerequisites Checklist

Before starting, ensure you have:

- [ ] Node.js 18+ installed
- [ ] Zapmail account with API access
- [ ] Your Zapmail API key
- [ ] Optional: OpenAI API key for enhanced NLP

## 🚀 Step 1: Environment Setup

### 1.1 Install Node.js
```bash
# Check if Node.js is installed
node --version

# If not installed, download from https://nodejs.org/
# Or use a package manager:
# macOS: brew install node
# Ubuntu: sudo apt install nodejs npm
```

### 1.2 Clone the Repository
```bash
git clone <repository-url>
cd zapmail-mcp-nl
```

### 1.3 Install Dependencies
```bash
npm install
```

## 🔑 Step 2: API Key Setup

### 2.1 Get Your Zapmail API Key
1. Log into your Zapmail account
2. Go to Settings → Integrations → API
3. Copy your API key

### 2.2 Set Environment Variables
```bash
# Required
export ZAPMAIL_API_KEY="your-zapmail-api-key"

# Optional but recommended
export ZAPMAIL_WORKSPACE_KEY="your-workspace-id"
export ZAPMAIL_SERVICE_PROVIDER="GOOGLE"  # or "MICROSOFT"
export ZAPMAIL_LOG_LEVEL="INFO"
export ZAPMAIL_ENABLE_METRICS="true"
export ZAPMAIL_ENABLE_CACHE="true"
```

### 2.3 Verify API Key (Optional)
```bash
# Test your API key
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/invoke", "params": {"tool_name": "list_workspaces", "input": {}}}' | node index.js
```

## 🏃‍♂️ Step 3: First Run

### 3.1 Start the Server
```bash
node index.js
```

You should see output like:
```
{"timestamp":"2025-09-03T21:50:24.899Z","level":"INFO","message":"Loading endpoint manifest from docs.zapmail.ai"}
{"timestamp":"2025-09-03T21:50:26.092Z","level":"INFO","message":"Loaded 46 endpoints","data":{"duration":1193,"count":46}}
```

### 3.2 Test Server Health
In a new terminal:
```bash
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/invoke", "params": {"tool_name": "health_check", "input": {"detailed": true}}}' | node index.js
```

## 📚 Step 4: Basic Operations

### 4.1 List Available Tools
```bash
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}' | node index.js
```

### 4.2 List Your Workspaces
```bash
echo '{"jsonrpc": "2.0", "id": 2, "method": "tools/invoke", "params": {"tool_name": "list_workspaces", "input": {}}}' | node index.js
```

### 4.3 Set Workspace Context
```bash
echo '{"jsonrpc": "2.0", "id": 3, "method": "tools/invoke", "params": {"tool_name": "set_context", "input": {"workspaceKey": "your-workspace-id", "serviceProvider": "GOOGLE"}}}' | node index.js
```

### 4.4 List Domains in Workspace
```bash
echo '{"jsonrpc": "2.0", "id": 4, "method": "tools/invoke", "params": {"tool_name": "list_domains", "input": {}}}' | node index.js
```

## 🎯 Step 5: Natural Language Commands

### 5.1 Test Natural Language Processing
```bash
# Dry run - see what would happen
echo '{"jsonrpc": "2.0", "id": 5, "method": "tools/invoke", "params": {"tool_name": "plan_and_execute", "input": {"instruction": "list all workspaces", "execute": false}}}' | node index.js
```

### 5.2 Execute Natural Language Commands
```bash
# Actually execute the command
echo '{"jsonrpc": "2.0", "id": 6, "method": "tools/invoke", "params": {"tool_name": "plan_and_execute", "input": {"instruction": "list all workspaces", "execute": true}}}' | node index.js
```

## 🌐 Step 6: Domain Operations

### 6.1 Check Domain Availability
```bash
echo '{"jsonrpc": "2.0", "id": 7, "method": "tools/invoke", "params": {"tool_name": "check_domain_availability", "input": {"domainName": "example.com", "years": 1}}}' | node index.js
```

### 6.2 Purchase Domains
```bash
echo '{"jsonrpc": "2.0", "id": 8, "method": "tools/invoke", "params": {"tool_name": "purchase_domains", "input": {"domains": ["example.com", "test.com"], "years": 1, "preferWallet": true}}}' | node index.js
```

### 6.3 Natural Language Domain Purchase
```bash
echo '{"jsonrpc": "2.0", "id": 9, "method": "tools/invoke", "params": {"tool_name": "plan_and_execute", "input": {"instruction": "buy example.com and test.com for 1 year", "execute": false}}}' | node index.js
```

## 📧 Step 7: Mailbox Operations

### 7.1 Create Mailboxes on Empty Domains
```bash
echo '{"jsonrpc": "2.0", "id": 10, "method": "tools/invoke", "params": {"tool_name": "create_mailboxes_for_zero_domains", "input": {"countPerDomain": 3}}}' | node index.js
```

### 7.2 Generate Usernames
```bash
echo '{"jsonrpc": "2.0", "id": 11, "method": "tools/invoke", "params": {"tool_name": "generate_usernames", "input": {"name": "John Doe", "numberOfNames": 5}}}' | node index.js
```

### 7.3 Generate Name Pairs
```bash
echo '{"jsonrpc": "2.0", "id": 12, "method": "tools/invoke", "params": {"tool_name": "generate_name_pairs", "input": {"numberOfNames": 3, "ethnicity": "American", "gender": "male"}}}' | node index.js
```

### 7.4 Bulk Update Mailboxes
```bash
echo '{"jsonrpc": "2.0", "id": 13, "method": "tools/invoke", "params": {"tool_name": "bulk_update_mailboxes", "input": {"updates": [{"mailboxId": "mb_123", "firstName": "John", "lastName": "Doe"}]}}}' | node index.js
```

## 📤 Step 8: Export Operations

### 8.1 Get Export Information
```bash
echo '{"jsonrpc": "2.0", "id": 14, "method": "tools/invoke", "params": {"tool_name": "get_export_info", "input": {"platform": "REACHINBOX", "includeExamples": true}}}' | node index.js
```

### 8.2 Add Third-Party Account
```bash
echo '{"jsonrpc": "2.0", "id": 15, "method": "tools/invoke", "params": {"tool_name": "add_third_party_account", "input": {"email": "user@reachinbox.com", "password": "your-password", "app": "REACHINBOX"}}}' | node index.js
```

### 8.3 Get Export Guidance
```bash
echo '{"jsonrpc": "2.0", "id": 16, "method": "tools/invoke", "params": {"tool_name": "export_guidance", "input": {"goal": "Export all active mailboxes to Reachinbox", "platform": "REACHINBOX", "mailboxes": 100}}}' | node index.js
```

### 8.4 Natural Language Export
```bash
echo '{"jsonrpc": "2.0", "id": 17, "method": "tools/invoke", "params": {"tool_name": "plan_and_execute", "input": {"instruction": "export all mailboxes to reachinbox", "execute": false}}}' | node index.js
```

## 💰 Step 9: Wallet Operations

### 9.1 Check Wallet Balance
```bash
echo '{"jsonrpc": "2.0", "id": 18, "method": "tools/invoke", "params": {"tool_name": "wallet_balance", "input": {}}}' | node index.js
```

### 9.2 Add Balance to Wallet
```bash
echo '{"jsonrpc": "2.0", "id": 19, "method": "tools/invoke", "params": {"tool_name": "call_endpoint", "input": {"slug": "add-balance-to-wallet-13490582e0", "body": {"amount": 100, "paymentMethod": "card_123"}}}}' | node index.js
```

## 🔍 Step 10: Advanced Features

### 10.1 Search Mailboxes
```bash
echo '{"jsonrpc": "2.0", "id": 20, "method": "tools/invoke", "params": {"tool_name": "search_mailboxes", "input": {"firstName": "John", "status": "ACTIVE"}}}' | node index.js
```

### 10.2 Get API Information
```bash
echo '{"jsonrpc": "2.0", "id": 21, "method": "tools/invoke", "params": {"tool_name": "get_api_info", "input": {"category": "domains", "includeExamples": true}}}' | node index.js
```

### 10.3 Search API Endpoints
```bash
echo '{"jsonrpc": "2.0", "id": 22, "method": "tools/invoke", "params": {"tool_name": "search_api_endpoints", "input": {"keyword": "dns"}}}' | node index.js
```

### 10.4 Get System Metrics
```bash
echo '{"jsonrpc": "2.0", "id": 23, "method": "tools/invoke", "params": {"tool_name": "get_metrics", "input": {"includeCache": true, "includeTimers": true, "includeCounters": true}}}' | node index.js
```

## 🛠️ Step 11: Troubleshooting

### 11.1 Enable Debug Logging
```bash
export ZAPMAIL_LOG_LEVEL="DEBUG"
node index.js
```

### 11.2 Clear Cache
```bash
echo '{"jsonrpc": "2.0", "id": 24, "method": "tools/invoke", "params": {"tool_name": "clear_cache", "input": {"confirm": true}}}' | node index.js
```

### 11.3 Check Server Info
```bash
echo '{"jsonrpc": "2.0", "id": 25, "method": "tools/invoke", "params": {"tool_name": "get_server_info", "input": {}}}' | node index.js
```

## 🎯 Step 12: Complex Workflows

### 12.1 Complete Domain Setup Workflow
```bash
echo '{"jsonrpc": "2.0", "id": 26, "method": "tools/invoke", "params": {"tool_name": "plan_and_execute", "input": {"instruction": "Buy example.com and test.com, create 5 mailboxes on each domain, and export all mailboxes to reachinbox", "execute": false}}}' | node index.js
```

### 12.2 Bulk Operations Workflow
```bash
echo '{"jsonrpc": "2.0", "id": 27, "method": "tools/invoke", "params": {"tool_name": "plan_and_execute", "input": {"instruction": "Create 3 mailboxes on all empty domains, update their names to realistic ones, and export to instantly", "execute": false}}}' | node index.js
```

## 📊 Step 13: Monitoring & Maintenance

### 13.1 Regular Health Checks
```bash
# Run this periodically to ensure everything is working
echo '{"jsonrpc": "2.0", "id": 28, "method": "tools/invoke", "params": {"tool_name": "health_check", "input": {"detailed": true}}}' | node index.js
```

### 13.2 Monitor Performance
```bash
# Check system performance
echo '{"jsonrpc": "2.0", "id": 29, "method": "tools/invoke", "params": {"tool_name": "get_metrics", "input": {"includeCache": true, "includeTimers": true, "includeCounters": true}}}' | node index.js
```

### 13.3 Cache Management
```bash
# Clear cache when needed
echo '{"jsonrpc": "2.0", "id": 30, "method": "tools/invoke", "params": {"tool_name": "clear_cache", "input": {"confirm": true}}}' | node index.js
```

## 🔧 Step 14: Advanced Configuration

### 14.1 Custom Rate Limiting
```bash
export ZAPMAIL_RATE_LIMIT_DELAY="2000"  # 2 seconds between requests
```

### 14.2 Custom Caching
```bash
export ZAPMAIL_CACHE_TTL="600000"  # 10 minutes
export ZAPMAIL_CACHE_MAX_SIZE="2000"
```

### 14.3 Enhanced Logging
```bash
export ZAPMAIL_LOG_LEVEL="DEBUG"
export ZAPMAIL_ENABLE_METRICS="true"
```

## 🎉 Step 15: Production Deployment

### 15.1 Environment File Setup
Create a `.env` file:
```bash
ZAPMAIL_API_KEY=your-api-key
ZAPMAIL_WORKSPACE_KEY=your-workspace-id
ZAPMAIL_SERVICE_PROVIDER=GOOGLE
ZAPMAIL_LOG_LEVEL=INFO
ZAPMAIL_ENABLE_METRICS=true
ZAPMAIL_ENABLE_CACHE=true
ZAPMAIL_MAX_RETRIES=3
ZAPMAIL_TIMEOUT_MS=30000
ZAPMAIL_RATE_LIMIT_DELAY=1000
```

### 15.2 Process Management
```bash
# Using PM2 for production
npm install -g pm2
pm2 start index.js --name "zapmail-mcp"
pm2 save
pm2 startup
```

### 15.3 Monitoring
```bash
# Monitor the process
pm2 status
pm2 logs zapmail-mcp
pm2 monit
```

## 📚 Step 16: Learning Resources

### 16.1 API Documentation
```bash
# Get comprehensive API information
echo '{"jsonrpc": "2.0", "id": 31, "method": "tools/invoke", "params": {"tool_name": "get_api_info", "input": {"category": "domains"}}}' | node index.js
```

### 16.2 Best Practices
```bash
# Get best practices for any category
echo '{"jsonrpc": "2.0", "id": 32, "method": "tools/invoke", "params": {"tool_name": "get_api_best_practices", "input": {"category": "mailboxes"}}}' | node index.js
```

### 16.3 Usage Examples
```bash
# Generate examples for any endpoint
echo '{"jsonrpc": "2.0", "id": 33, "method": "tools/invoke", "params": {"tool_name": "generate_api_examples", "input": {"category": "domains", "endpoint": "checkAvailability"}}}' | node index.js
```

## 🎯 Common Use Cases

### Use Case 1: New Domain Setup
1. Check domain availability
2. Purchase domains
3. Create mailboxes
4. Configure DNS
5. Export to platform

### Use Case 2: Bulk Mailbox Management
1. List domains with zero mailboxes
2. Create mailboxes in bulk
3. Generate realistic names
4. Update mailbox details
5. Export to third-party platform

### Use Case 3: Export Workflow
1. Add third-party account credentials
2. Select mailboxes to export
3. Configure export settings
4. Execute export
5. Verify successful export

## 🚨 Troubleshooting Checklist

If something isn't working:

- [ ] Check API key is set correctly
- [ ] Verify workspace context is set
- [ ] Check network connectivity
- [ ] Review error logs
- [ ] Clear cache if needed
- [ ] Run health check
- [ ] Enable debug logging
- [ ] Check rate limiting settings

## 🎉 Congratulations!

You've successfully set up and learned to use the Zapmail MCP server! You can now:

- ✅ Manage domains and mailboxes
- ✅ Export to third-party platforms
- ✅ Use natural language commands
- ✅ Monitor system performance
- ✅ Troubleshoot issues effectively

## 📞 Need Help?

- Check the troubleshooting section
- Review the API documentation
- Run health checks
- Enable debug logging
- Check the main README for more details

---

**Happy automating with Zapmail! 🚀**
