import Builder from "@ophidian/build";
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const manifest = require("./manifest.json");

new Builder("src/quick-explorer.tsx")
.withWatch(new URL('', import.meta.url).pathname)
.withSass()
.withInstall(manifest.id)
.build();

