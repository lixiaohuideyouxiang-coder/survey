-- ============================================================================
-- 钉钉 H5 调查问卷系统 - Supabase 数据库建表脚本 (PostgreSQL)
-- 使用方法：打开 Supabase 控制台 -> SQL Editor -> New Query -> 粘贴并点击 Run
-- ============================================================================

-- 1. 创建问卷回答表 survey_responses
CREATE TABLE IF NOT EXISTS public.survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  edit_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 以 name 作为唯一冲突键，支持 onConflict: 'name' 的 upsert 操作
  CONSTRAINT survey_responses_name_unique UNIQUE (name)
);

-- 2. 创建索引以加速按姓名查询与按最后修改时间排序
CREATE INDEX IF NOT EXISTS idx_survey_responses_name ON public.survey_responses (name);
CREATE INDEX IF NOT EXISTS idx_survey_responses_updated_at ON public.survey_responses (updated_at DESC);

-- 3. 启用行级安全策略 (RLS) 并配置匿名访问权限（前端使用 anon key 直接读写）
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

-- 允许匿名端查询记录（用于按姓名回显历史记录及后台管理列表展示）
DROP POLICY IF EXISTS "Allow public select on survey_responses" ON public.survey_responses;
CREATE POLICY "Allow public select on survey_responses"
  ON public.survey_responses
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 允许匿名端首次插入记录
DROP POLICY IF EXISTS "Allow public insert on survey_responses" ON public.survey_responses;
CREATE POLICY "Allow public insert on survey_responses"
  ON public.survey_responses
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 允许匿名端按姓名更新记录（用于 upsert 覆盖更新）
DROP POLICY IF EXISTS "Allow public update on survey_responses" ON public.survey_responses;
CREATE POLICY "Allow public update on survey_responses"
  ON public.survey_responses
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 4. 添加表与字段注释
COMMENT ON TABLE public.survey_responses IS '区域网管工作经验调查问卷回答表';
COMMENT ON COLUMN public.survey_responses.name IS '填写人姓名（唯一键）';
COMMENT ON COLUMN public.survey_responses.answer IS '问卷完整回答内容';
COMMENT ON COLUMN public.survey_responses.edit_count IS '二次修改累计次数（首次提交为 0）';
COMMENT ON COLUMN public.survey_responses.created_at IS '首次提交时间';
COMMENT ON COLUMN public.survey_responses.updated_at IS '最后修改时间';
