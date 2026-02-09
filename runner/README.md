# Cli Remote Runner

Remote terminal runner for Cli Remote project. This package allows you to run a terminal session that connects to a remote broker server.

## Installation

### Global Installation (Recommended)

```bash
npm install -g claude-remote-runner
```

### Local Installation

```bash
npm install claude-remote-runner
```

## Usage

### Quick Start

```bash
claude-runner --url https://your-broker.com --id my-runner --secret your-secret
```

### Command Line Options

```bash
claude-runner [options]

Options:
  --url <url>        Broker server URL (default: http://localhost:3000)
  --id <id>          Runner ID (default: runner-1)
  --secret <secret>  Runner secret for authentication
  --help, -h         Show help message
```

### Configuration

You can configure the runner using:

1. **Command line arguments** (highest priority)
2. **Environment variables**
3. **Configuration file**

#### Environment Variables

Create a `.env` file in your project directory or `.claude-runner.env` in your home directory:

```env
BROKER_URL=https://your-broker.com
RUNNER_ID=my-runner
RUNNER_SECRET=your-secret
```

#### Configuration File Priority

1. `.env` in current directory
2. `.claude-runner.env` in home directory

### Examples

#### Using environment variables

```bash
export BROKER_URL=https://broker.example.com
export RUNNER_ID=my-runner
export RUNNER_SECRET=my-secret
claude-runner
```

#### Using configuration file

Create `.claude-runner.env` in your home directory:

```env
BROKER_URL=https://broker.example.com
RUNNER_ID=my-runner
RUNNER_SECRET=my-secret
```

Then simply run:

```bash
claude-runner
```

#### Override with command line

```bash
claude-runner --url https://another-broker.com --id another-runner
```

## Requirements

- Node.js >= 16.0.0
- A running broker server

## License

MIT
