# Contributing

Run the full check before opening a PR:

```bash
npm run check
```

Keep changes focused. Do not commit generated deployment files, tenant-specific config, secrets, or real customer workbook data.

For UI changes, preserve the Glean-styled, Office-native design principles:

- sentence-case UI copy;
- visible workbook context;
- preview-before-write for workbook mutations;
- accessible labels and keyboard focus;
- no color-only status communication.
