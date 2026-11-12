# Haven Kit

[中文](README.md) · [English](README.en.md)

连接模型契约、编辑运行时与 Angular 界面的基础组件库。Haven Kit 把字段、表格、树、校验和编辑语义表达为共享契约，让 API 与界面使用一致的数据结构和规则。

## 功能

- Schema：文档与编辑契约、JSON Schema 和字段/组件校验。
- Runtime：模型处理、规范化与共享编辑行为。
- UI：Angular 组件、主题和表单/表格/树相关界面能力。
- 复杂字段：多语言、富文本、选项、时间、资源与关联结构。
- 编辑语义：命令、变更校验、候选编辑与历史处理。
- 包边界：独立包构建、类型检查、单元/UI 与包消费测试。

## 快速开始

Node.js `>=26.13.0 <27`、pnpm `12.18.0`。

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
```

## 配置

| 配置项 | 说明 |
| --- | --- |
| `packages/schema/` | 类型、契约与生成的 JSON Schema。 |
| `packages/runtime/` | 运行时与共享编辑逻辑。 |
| `packages/ui/` | Angular UI 组件。 |
| `tools/` | Schema 生成、边界检查与包消费验证。 |

## 使用

应用按需依赖 `@haven/schema`、`@haven/runtime`、`@haven/ui`。Haven API 与 Haven Studio 使用同一组包版本；本地构建后，可通过自己的包仓库分发给这些应用。包版本与导出入口见各包的 `package.json`。

## 项目结构

- `packages/` — 三个共享包
- `tools/browser/` — 浏览器测试夹具

## 许可

[PolyForm Noncommercial 1.0.0](LICENSE)。原创部分与第三方组件的适用范围见 [LICENSE_SCOPE.md](LICENSE_SCOPE.md)；各第三方版权和许可见相应声明文件。
