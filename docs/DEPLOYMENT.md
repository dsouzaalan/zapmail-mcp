# 🚀 Deployment Guide

## 📋 Prerequisites

- **Node.js 18+** installed
- **Zapmail API Key** from [Zapmail Dashboard](https://app.zapmail.ai)
- **Docker** (optional, for containerized deployment)
- **Git** for version control

## 🏗️ Deployment Options

### Option 1: Direct Node.js Deployment

#### 1. Clone and Setup
```bash
git clone https://github.com/zapmail/zapmail-mcp-server.git
cd zapmail-mcp-server
npm install
```

#### 2. Configure Environment
```bash
cp env.example .env
# Edit .env with your API key and settings
```

#### 3. Validate Setup
```bash
npm run validate
npm run health
```

#### 4. Start Server
```bash
npm start
```

### Option 2: Docker Deployment

#### 1. Build and Run
```bash
# Build the image
docker build -t zapmail-mcp-server .

# Run with environment variables
docker run -d \
  --name zapmail-mcp-server \
  -e ZAPMAIL_API_KEY="your-api-key" \
  -e ZAPMAIL_WORKSPACE_KEY="your-workspace-id" \
  -e ZAPMAIL_LOG_LEVEL=INFO \
  zapmail-mcp-server
```

#### 2. Using Docker Compose
```bash
# Create .env file
cp env.example .env
# Edit .env with your settings

# Start services
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs zapmail-mcp
```

### Option 3: Production Deployment

#### 1. Systemd Service (Linux)
```bash
# Create service file
sudo tee /etc/systemd/system/zapmail-mcp.service << EOF
[Unit]
Description=Zapmail MCP Server
After=network.target

[Service]
Type=simple
User=zapmail
WorkingDirectory=/opt/zapmail-mcp-server
Environment=NODE_ENV=production
Environment=ZAPMAIL_API_KEY=your-api-key
Environment=ZAPMAIL_LOG_LEVEL=INFO
Environment=ZAPMAIL_RATE_LIMIT_DELAY=2000
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable zapmail-mcp
sudo systemctl start zapmail-mcp
sudo systemctl status zapmail-mcp
```

#### 2. PM2 Process Manager
```bash
# Install PM2
npm install -g pm2

# Create ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'zapmail-mcp-server',
    script: 'src/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      ZAPMAIL_API_KEY: 'your-api-key',
      ZAPMAIL_LOG_LEVEL: 'INFO',
      ZAPMAIL_RATE_LIMIT_DELAY: '2000'
    }
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 🔧 Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ZAPMAIL_API_KEY` | ✅ | - | Your Zapmail API key |
| `ZAPMAIL_WORKSPACE_KEY` | ❌ | - | Default workspace ID |
| `ZAPMAIL_SERVICE_PROVIDER` | ❌ | GOOGLE | Email provider |
| `ZAPMAIL_LOG_LEVEL` | ❌ | INFO | Logging level |
| `ZAPMAIL_RATE_LIMIT_DELAY` | ❌ | 1000 | Rate limit delay (ms) |
| `ZAPMAIL_ENABLE_CACHE` | ❌ | true | Enable caching |
| `ZAPMAIL_ENABLE_METRICS` | ❌ | true | Enable metrics |
| `OPENAI_API_KEY` | ❌ | - | OpenAI API key for NLP |

### Production Settings

```bash
# Recommended production configuration
export ZAPMAIL_LOG_LEVEL="INFO"
export ZAPMAIL_RATE_LIMIT_DELAY="2000"
export ZAPMAIL_ENABLE_CACHE="true"
export ZAPMAIL_ENABLE_METRICS="true"
export ZAPMAIL_MAX_RETRIES="3"
export ZAPMAIL_TIMEOUT_MS="30000"
```

## 🔍 Monitoring

### Health Checks

```bash
# Basic health check
npm run health

# Comprehensive validation
npm run validate

# Full test suite
npm test
```

### Log Monitoring

```bash
# View logs (systemd)
sudo journalctl -u zapmail-mcp -f

# View logs (PM2)
pm2 logs zapmail-mcp-server

# View logs (Docker)
docker-compose logs -f zapmail-mcp
```

### Metrics

```bash
# Get performance metrics
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/invoke", "params": {"tool_name": "get_metrics", "input": {"includeCache": true, "includeTimers": true, "includeCounters": true}}}' | node src/index.js
```

## 🔒 Security

### API Key Security

1. **Never commit API keys** to version control
2. **Use environment variables** for sensitive data
3. **Rotate keys regularly** (every 90 days)
4. **Monitor key usage** for suspicious activity

### Network Security

1. **Use HTTPS** for all external communications
2. **Implement firewall rules** to restrict access
3. **Use VPN** for remote access
4. **Monitor network traffic** for anomalies

### Access Control

1. **Use non-root users** for running the service
2. **Implement proper file permissions**
3. **Regular security updates**
4. **Audit logging** for all operations

## 📊 Performance Optimization

### Caching Strategy

```bash
# Enable aggressive caching
export ZAPMAIL_ENABLE_CACHE="true"
export ZAPMAIL_CACHE_TTL="600000"  # 10 minutes
export ZAPMAIL_CACHE_MAX_SIZE="2000"
```

### Rate Limiting

```bash
# Conservative rate limiting for production
export ZAPMAIL_RATE_LIMIT_DELAY="2000"  # 2 seconds

# Aggressive rate limiting for development
export ZAPMAIL_RATE_LIMIT_DELAY="500"   # 0.5 seconds
```

### Memory Management

```bash
# Set Node.js memory limits
export NODE_OPTIONS="--max-old-space-size=2048"
```

## 🚨 Troubleshooting

### Common Issues

#### 1. API Key Issues
```bash
# Check if API key is set
echo $ZAPMAIL_API_KEY

# Test API key validity
npm run health
```

#### 2. Rate Limiting
```bash
# Increase rate limit delay
export ZAPMAIL_RATE_LIMIT_DELAY="5000"

# Check rate limit status
npm run health
```

#### 3. Memory Issues
```bash
# Check memory usage
pm2 monit

# Restart service
pm2 restart zapmail-mcp-server
```

#### 4. Network Issues
```bash
# Test connectivity
curl -I https://api.zapmail.ai/api

# Check DNS resolution
nslookup api.zapmail.ai
```

### Debug Mode

```bash
# Enable debug logging
export ZAPMAIL_LOG_LEVEL="DEBUG"

# Run with debug output
node src/index.js
```

## 📈 Scaling

### Horizontal Scaling

1. **Load Balancer**: Use nginx or HAProxy
2. **Multiple Instances**: Run multiple server instances
3. **Database**: Use shared cache (Redis)
4. **Monitoring**: Centralized logging and metrics

### Vertical Scaling

1. **Memory**: Increase Node.js heap size
2. **CPU**: Use more powerful servers
3. **Storage**: Use SSD storage for better I/O
4. **Network**: Use faster network connections

## 🔄 Updates

### Updating the Server

```bash
# Pull latest changes
git pull origin main

# Install dependencies
npm install

# Run tests
npm test

# Restart service
sudo systemctl restart zapmail-mcp
# or
pm2 restart zapmail-mcp-server
# or
docker-compose restart zapmail-mcp
```

### Backup Strategy

1. **Configuration**: Backup `.env` files
2. **Logs**: Archive old log files
3. **Cache**: Backup cache data if needed
4. **Code**: Use version control (Git)

## 📞 Support

### Getting Help

1. **Documentation**: Check [README.md](../README.md)
2. **Issues**: Report on [GitHub](https://github.com/zapmail/zapmail-mcp-server/issues)
3. **Community**: Join our [Discord](https://discord.gg/zapmail)
4. **Email**: Contact [support@zapmail.ai](mailto:support@zapmail.ai)

### Emergency Procedures

1. **Service Down**: Check logs and restart service
2. **API Issues**: Verify API key and connectivity
3. **Performance Issues**: Check metrics and scale accordingly
4. **Security Breach**: Rotate API keys and investigate logs
