# @predictorsdk/client

The official TypeScript/JavaScript client for the [PredictorSDK](https://predictorsdk.com) matching markets API.

## Installation

```bash
npm install @predictorsdk/client
```

## Usage

```typescript
import { PredictorSDKClient } from "@predictorsdk/client";

const client = new PredictorSDKClient({ token: "your-api-key" });

const { markets } = await client.getSportsMatchingMarkets({
  kalshi_event_ticker: "KXMLB-25-NYM-COL-2025-04-03",
});
```

## Documentation

- [Docs](https://docs.predictorsdk.com)
- [API Reference](https://docs.predictorsdk.com/api-reference)

## License

[MIT](https://github.com/PredictorSDK/sdk-typescript/blob/main/LICENSE)
