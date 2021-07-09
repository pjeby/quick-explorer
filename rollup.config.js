import builder from "obsidian-rollup-presets";

export default builder()
.apply(c => c.output.sourcemap = "inline")
.assign({input: "src/quick-explorer.tsx"})
.withTypeScript()
.withInstall(__dirname)
.build();
