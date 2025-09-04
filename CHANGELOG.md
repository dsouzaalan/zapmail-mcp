# 📋 Changelog

All notable changes to the Zapmail MCP Server project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2024-09-04

### 🚀 Added
- **Scheduled Domain Purchases**: Automated domain buying with intelligent rate limit handling
- **Enhanced Project Structure**: Proper directory organization with `src/`, `scripts/`, and `docs/`
- **Docker Support**: Production-ready Dockerfile and docker-compose.yml
- **Comprehensive Scripts**: Health check, validation, testing, and cleanup scripts
- **Technical Documentation**: Detailed API reference and deployment guides
- **Enhanced Error Handling**: Better error messages and recovery mechanisms
- **Performance Monitoring**: Real-time metrics and health checks
- **Security Improvements**: Input validation and workspace isolation

### 🔧 Improved
- **Package.json**: Better metadata, scripts, and project configuration
- **README.md**: Comprehensive documentation with examples and best practices
- **Logging System**: Enhanced JSON logging with structured data
- **Rate Limiting**: Intelligent request throttling with exponential backoff
- **Caching Strategy**: LRU cache with TTL for improved performance
- **Code Organization**: Better separation of concerns and modularity

### 🐛 Fixed
- **Rate Limit Issues**: Improved handling of HTTP 429 errors
- **Error Recovery**: Better retry logic with exponential backoff
- **Memory Management**: Optimized cache usage and cleanup
- **API Key Validation**: Enhanced validation and error reporting

### 📚 Documentation
- **Technical Guide**: Comprehensive technical documentation
- **Deployment Guide**: Step-by-step deployment instructions
- **API Reference**: Detailed tool documentation with examples
- **Best Practices**: Security, performance, and troubleshooting guides

### 🔒 Security
- **Input Validation**: All inputs validated and sanitized
- **API Key Security**: Secure handling and validation
- **Workspace Isolation**: Proper context switching and isolation
- **Error Handling**: No sensitive data in error messages

## [2.0.0] - 2024-08-15

### 🚀 Added
- **Natural Language Processing**: Human-readable commands and instructions
- **Dynamic Tool Generation**: Automatic tool creation from API documentation
- **Complete API Coverage**: All 46 documented Zapmail endpoints
- **Wallet-First Logic**: Automatic wallet balance detection for purchases
- **Export System**: Support for Reachinbox, Instantly, Smartlead, Reply.io
- **Workspace Management**: Multi-workspace support with context switching
- **Rate Limiting**: Configurable request throttling
- **Caching System**: LRU cache with TTL for improved performance
- **Metrics & Monitoring**: Performance tracking and health checks

### 🔧 Improved
- **Error Handling**: Robust error recovery and graceful degradation
- **Retry Logic**: Exponential backoff for failed requests
- **Logging**: Structured JSON logging with timestamps
- **Configuration**: Environment-based configuration system

### 🐛 Fixed
- **API Compatibility**: Fixed issues with Zapmail API changes
- **Memory Leaks**: Resolved memory issues in long-running processes
- **Error Reporting**: Improved error messages and debugging information

## [1.0.0] - 2024-07-01

### 🚀 Initial Release
- **Basic MCP Server**: Core JSON-RPC server implementation
- **Domain Management**: Basic domain operations (check, purchase)
- **Mailbox Operations**: Create and manage mailboxes
- **API Integration**: Basic Zapmail API integration
- **Documentation**: Initial README and setup instructions

---

## 🔗 Links

- [GitHub Repository](https://github.com/zapmail/zapmail-mcp-server)
- [Documentation](https://github.com/zapmail/zapmail-mcp-server#readme)
- [Issues](https://github.com/zapmail/zapmail-mcp-server/issues)
- [Discord Community](https://discord.gg/zapmail)

## 📝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) for details.
