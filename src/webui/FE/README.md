# LLOneBot WebUI - React 重构版

## 已完成的重构

✅ 将 Vue 3 项目重构为 React 18 + TypeScript  
✅ 使用 Tailwind CSS 实现现代化 UI 设计  
✅ 保留所有原有功能：
  - OneBot 11 配置
  - Satori 配置  
  - 全局配置
  - 账号信息显示
  - 关于页面

✅ 新增功能：
  - 现代化侧边栏导航
  - Dashboard 概览页面
  - 渐变色主题设计
  - 响应式布局
  - 平滑动画效果

## 安装依赖

```bash
cd D:\code\QQRobot\LLOneBot\src\webui\FE
npm install
```

## 开发运行

```bash
npm run dev
```

访问 http://localhost:5173

## 构建生产版本

```bash
npm run build
```

构建产物将输出到 `dist/webui` 目录

## 技术栈

- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **Tailwind CSS** - 样式框架
- **Lucide React** - 图标库

## 项目结构

```
src/
├── components/       # React 组件
│   ├── Sidebar.tsx          # 侧边栏导航
│   └── OneBotConfig.tsx     # OneBot 配置组件
├── types/           # TypeScript 类型定义
│   └── index.ts
├── utils/           # 工具函数
│   └── api.ts              # API 请求封装
├── App.tsx          # 主应用组件
├── main.tsx         # 入口文件
└── index.css        # 全局样式（含 Tailwind）
```

## 主要改进

1. **现代化 UI**：采用渐变色、卡片式设计、圆角阴影
2. **更好的用户体验**：平滑动画、hover 效果、加载状态
3. **代码组织**：更清晰的组件划分和类型定义
4. **性能优化**：使用 Vite 的快速 HMR
5. **类型安全**：完整的 TypeScript 类型定义

## 注意事项

- 确保后端 API 路径正确（默认：`/api/config`）
- Token 存储在 localStorage 中（key: `webui_token`）
- 支持通过 URL 参数传递 token：`?token=your_token`
