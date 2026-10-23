/**
 * 钉钉 H5 调查问卷及后台管理系统 - 核心配置文件
 * 部署前请将 SUPABASE_URL 和 SUPABASE_ANON_KEY 替换为您自己的 Supabase 项目配置
 */

// 1. 顶部固定写死简答题配置数组 QUESTIONS
const QUESTIONS = [
  {
    id: 'q1',
    title: '作为区域网管，在你区域遇到棘手、难缠、事多、讨厌的客户时，你会怎样处理和面对？',
    placeholder: '请结合您的实际一线工作经验，详细谈谈您的沟通方式、处理思路与应对策略...',
    required: true,
    minLength: 5
  }
];

// 2. 管理员后台解锁密码（默认 admin888）
const ADMIN_PASSWORD = 'admin888';

// 3. Supabase 数据库连接配置
// 获取方式：Supabase 控制台 -> Project Settings -> API -> Project URL & anon public key
const SUPABASE_URL = 'https://your-project-id.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-public-key';

// 4. 页面基础信息配置
const SURVEY_META = {
  title: '区域网管工作经验调研问卷',
  subtitle: '请如实填写您的姓名与处理经验，支持随时按姓名查询并修改已提交的回答。',
  department: '区域网络运维管理中心',
  tableName: 'survey_responses',
  storageKeyName: 'dingtalk_survey_user_name',
  storageKeyAdminAuth: 'dingtalk_survey_admin_unlocked',
  storageKeyRuntimeConfig: 'dingtalk_survey_supabase_config',
  storageKeyLocalMockRows: 'dingtalk_survey_local_demo_rows'
};
