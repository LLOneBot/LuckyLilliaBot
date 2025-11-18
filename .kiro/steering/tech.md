# Technology Stack

## Runtime & Language

- **Node.js**: v22.x or higher required
- **TypeScript**: ES modules with strict mode enabled
- **Package Manager**: Yarn 4.10.3

## Build System

- **Vite**: Primary build tool for bundling
- **tsx**: Development runtime for TypeScript execution
- **Target**: Node.js 22 with ESNext module format

## Core Dependencies

- **cordis**: Plugin system and context management
- **express**: HTTP server for API and WebUI
- **ws**: WebSocket server/client
- **minato + @minatojs/driver-sqlite**: Database layer with SQLite
- **@satorijs/protocol**: Satori protocol implementation
- **protobufjs**: Protocol buffer handling for QQ API
- **fluent-ffmpeg**: Media processing
- **silk-wasm**: Audio encoding for QQ voice messages

## Project Structure

- Path aliases configured in tsconfig.json:
  - `@/common/*` → `src/common/*`
  - `@/onebot11/*` → `src/onebot11/*`
  - `@/ntqqapi/*` → `src/ntqqapi/*`

## Common Commands

```bash
# Development
npm run dev              # Run in development mode with tsx
npm run dev-webui        # Start WebUI development server

# Building
npm run build            # Build main application with Vite
npm run build-webui      # Build WebUI frontend

# Code Quality
npm run format           # Format code with Prettier
npm run check            # TypeScript type checking

# Protocol Buffers
npm run compile:proto    # Compile .proto files to JS/TS
```

## Build Output

- Output directory: `dist/`
- Entry point: `dist/llonebot.js`
- Source maps enabled
- Minification disabled for debugging
- External dependencies bundled separately in `dist/node_modules/`

## Development Notes

- Uses ES modules exclusively (type: "module")
- Strict TypeScript configuration
- Source maps enabled for debugging
- Native Node.js modules and built-ins are externalized
