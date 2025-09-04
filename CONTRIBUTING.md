# Contributing to Zapmail MCP Server

Thank you for your interest in contributing to the Zapmail MCP Server! This document provides guidelines and information for contributors.

## 🤝 How to Contribute

### Reporting Issues
- Use the GitHub issue tracker to report bugs or request features
- Include detailed information about the issue, including:
  - Steps to reproduce
  - Expected vs actual behavior
  - Environment details (Node.js version, OS, etc.)
  - Error messages and logs

### Suggesting Features
- Open a feature request issue
- Describe the use case and expected functionality
- Include examples of how the feature would be used

### Code Contributions
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test your changes thoroughly
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## 🛠️ Development Setup

### Prerequisites
- Node.js 18+
- Zapmail API key for testing
- Git

### Local Development
```bash
# Clone the repository
git clone https://github.com/your-username/zapmail-mcp-server.git
cd zapmail-mcp-server

# Set up environment variables
cp env.example .env
# Edit .env with your API key

# Start in development mode
npm run dev
```

### Testing
```bash
# Run health check
npm run health

# Test specific functionality
npm run test
```

## 📝 Code Style Guidelines

### JavaScript
- Use ES6+ features
- Follow consistent naming conventions
- Add JSDoc comments for functions
- Use meaningful variable and function names
- Keep functions small and focused

### Error Handling
- Use custom error classes (ZapmailError, ValidationError, ApiError)
- Provide meaningful error messages
- Include proper error codes
- Log errors with appropriate context

### Logging
- Use structured JSON logging
- Include relevant context in log messages
- Use appropriate log levels (DEBUG, INFO, WARN, ERROR)
- Don't log sensitive information

## 🔧 Architecture Guidelines

### Adding New Tools
1. Add tool definition in `buildToolDefinitions()`
2. Add tool handler in `handleToolsInvoke()`
3. Add input validation
4. Add error handling
5. Add logging
6. Update documentation

### Adding New API Endpoints
1. Ensure the endpoint is documented in the API system
2. Add to appropriate category in `API_ENDPOINT_SYSTEM`
3. Update natural language patterns if needed
4. Add to examples and documentation

### Performance Considerations
- Use caching appropriately
- Implement rate limiting
- Monitor memory usage
- Optimize API calls
- Use async/await properly

## 📚 Documentation

### Code Documentation
- Add JSDoc comments for all functions
- Document parameters and return values
- Include usage examples
- Explain complex logic

### User Documentation
- Update README.md for new features
- Add examples to step-by-step guide
- Update quick reference if needed
- Include troubleshooting information

## 🧪 Testing Guidelines

### Manual Testing
- Test all new functionality
- Test error scenarios
- Test with different configurations
- Test performance impact

### Integration Testing
- Test API connectivity
- Test workspace context
- Test export functionality
- Test natural language processing

## 🚀 Release Process

### Version Bumping
- Follow semantic versioning
- Update version in package.json
- Update CHANGELOG.md
- Tag releases appropriately

### Pre-release Checklist
- [ ] All tests pass
- [ ] Documentation is updated
- [ ] Changelog is updated
- [ ] Version is bumped
- [ ] Code is reviewed

## 🐛 Bug Fixes

### Before Fixing
- Reproduce the issue
- Understand the root cause
- Check if it's already reported
- Consider the impact of the fix

### After Fixing
- Test the fix thoroughly
- Add regression tests if applicable
- Update documentation if needed
- Update changelog

## 🎯 Feature Development

### Planning
- Define clear requirements
- Consider user impact
- Plan testing strategy
- Consider backward compatibility

### Implementation
- Follow existing patterns
- Add proper error handling
- Include comprehensive logging
- Update all relevant documentation

## 📞 Getting Help

- Check existing issues and discussions
- Review the documentation
- Ask questions in issues
- Join community discussions

## 📄 License

By contributing to this project, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to the Zapmail MCP Server! 🚀
