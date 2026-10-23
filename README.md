# 钉钉移动端 H5 调查问卷及后台管理系统

轻量级、零构建依赖的移动端 H5 问卷系统，采用**钉钉蓝白清爽风格**设计，可直接部署在 **Vercel** 并使用 **Supabase** 作为后端数据库。

---

## 一、项目文件说明

- `index.html`：主页面结构（包含问卷填写页 `#/` 与管理员后台页 `#/admin`）
- `config.js`：核心配置文件（顶部固定简答题配置数组 `QUESTIONS`、管理员密码 `ADMIN_PASSWORD = 'admin888'`、Supabase 连接常量）
- `style.css`：移动端优先、钉钉蓝白清爽风格样式表（适配 iOS/Android 钉钉内置浏览器防缩放与底部安全区）
- `app.js`：前端核心交互逻辑（按姓名查询回显、`localStorage` 自动记忆、`upsert` 覆盖保存与 `edit_count` 累加、后台统计、实时搜索排序、带 `\uFEFF` BOM 头的 CSV 导出）
- `supabase_schema.sql`：Supabase 数据库建表与 RLS 权限配置脚本
- `vercel.json`：Vercel 静态部署配置文件

---

## 二、快速部署指南（Supabase + Vercel）

### 第 1 步：初始化 Supabase 数据表
1. 登录 [Supabase 控制台](https://supabase.com/dashboard) 并创建一个项目。
2. 进入左侧菜单 **SQL Editor** -> 点击 **New query**。
3. 复制本项目中 `supabase_schema.sql` 的全部内容粘贴进去，点击 **Run** 执行。
   - 该脚本会自动创建 `survey_responses` 表（以 `name` 作为唯一冲突键 `UNIQUE (name)`），并开启匿名读写策略。

### 第 2 步：填入 Supabase 密钥与自定义配置
打开 `config.js` 文件，修改以下常量：
```javascript
// 1. 简答题配置数组
const QUESTIONS = [
  {
    id: 'q1',
    title: '作为区域网管，在你区域遇到棘手、难缠、事多、讨厌的客户时，你会怎样处理和面对？',
    placeholder: '请结合您的实际一线工作经验，详细谈谈您的沟通方式、处理思路与应对策略...',
    required: true
  }
];

// 2. 管理员后台密码（默认 admin888）
const ADMIN_PASSWORD = 'admin888';

// 3. 填入您在 Supabase -> Project Settings -> API 中获取的 URL 和 anon public key
const SUPABASE_URL = 'https://您的项目ID.supabase.co';
const SUPABASE_ANON_KEY = '您的-anon-public-key';
```

### 第 3 步：一键部署到 Vercel
1. 将本文件夹推送至 GitHub / GitLab 仓库，或直接使用 Vercel CLI（运行 `vercel --prod`）上传。
2. 在 Vercel 导入该项目时，**Framework Preset** 选择 `Other`（纯静态站点，无需构建命令），点击 **Deploy** 即可在数秒内完成部署。
3. 将生成的 Vercel 域名链接直接发送到钉钉群或工作台，员工在钉钉内点击即可填写。
4. 管理员可点击页面顶部 **“管理后台”** 标签或直接访问 `https://您的域名/#/admin`，输入密码 `admin888` 查看统计并导出 Excel/CSV。
