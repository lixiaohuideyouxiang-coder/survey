/**
 * 钉钉移动端 H5 调查问卷及后台管理系统 - 核心逻辑 (app.js)
 * 依赖：config.js (QUESTIONS, ADMIN_PASSWORD, SUPABASE_URL, SUPABASE_ANON_KEY)
 */

(function () {
  'use strict';

  // ==================== 全局状态 ====================
  const state = {
    supabase: null,
    isCloudMode: false,
    currentRoute: 'survey', // 'survey' | 'admin'
    currentName: '',
    matchedRecord: null, // 当前姓名在数据库中匹配到的已存在记录
    isQuerying: false,
    isSubmitting: false,
    isAdminUnlocked: false,
    adminRecords: [],
    searchKeyword: '',
    sortMode: 'updated_desc',
    nameDebounceTimer: null,
    lastQueriedName: null
  };

  // ==================== DOM 引用 ====================
  const dom = {};

  function cacheDom() {
    dom.headerDept = document.getElementById('header-dept');
    dom.headerTitle = document.getElementById('header-title');
    dom.headerSubtitle = document.getElementById('header-subtitle');
    dom.btnDbStatus = document.getElementById('btn-db-status');
    dom.dbStatusDot = document.getElementById('db-status-dot');
    dom.dbStatusText = document.getElementById('db-status-text');

    dom.tabSurvey = document.getElementById('tab-survey');
    dom.tabAdmin = document.getElementById('tab-admin');
    dom.viewSurvey = document.getElementById('view-survey');
    dom.viewAdmin = document.getElementById('view-admin');

    // 问卷表单
    dom.surveyForm = document.getElementById('survey-form');
    dom.nameInput = document.getElementById('respondent-name');
    dom.btnClearName = document.getElementById('btn-clear-name');
    dom.btnQueryRecord = document.getElementById('btn-query-record');
    dom.btnQueryText = document.getElementById('btn-query-text');
    dom.historyBanner = document.getElementById('history-banner');
    dom.historyBannerIcon = document.getElementById('history-banner-icon');
    dom.historyBannerTitle = document.getElementById('history-banner-title');
    dom.historyBannerMeta = document.getElementById('history-banner-meta');
    dom.questionsContainer = document.getElementById('questions-container');
    dom.btnSubmit = document.getElementById('btn-submit');
    dom.btnSubmitText = document.getElementById('btn-submit-text');

    // 提交成功面板
    dom.submitSuccessCard = document.getElementById('submit-success-card');
    dom.successTitle = document.getElementById('success-title');
    dom.successDesc = document.getElementById('success-desc');
    dom.successMetaBox = document.getElementById('success-meta-box');
    dom.btnContinueEdit = document.getElementById('btn-continue-edit');

    // 管理后台
    dom.adminAuthCard = document.getElementById('admin-auth-card');
    dom.adminLoginForm = document.getElementById('admin-login-form');
    dom.adminPasswordInput = document.getElementById('admin-password-input');
    dom.btnTogglePwd = document.getElementById('btn-toggle-pwd');
    dom.adminAuthError = document.getElementById('admin-auth-error');
    dom.adminDashboard = document.getElementById('admin-dashboard');
    dom.adminLastSync = document.getElementById('admin-last-sync');
    dom.btnRefreshAdmin = document.getElementById('btn-refresh-admin');
    dom.btnLockAdmin = document.getElementById('btn-lock-admin');

    // 统计卡片
    dom.statTotalCount = document.getElementById('stat-total-count');
    dom.statTotalFoot = document.getElementById('stat-total-foot');
    dom.statModifiedCount = document.getElementById('stat-modified-count');
    dom.statModifiedFoot = document.getElementById('stat-modified-foot');
    dom.statAvgWords = document.getElementById('stat-avg-words');
    dom.statWordsFoot = document.getElementById('stat-words-foot');

    // 搜索、排序与导出
    dom.adminSearchInput = document.getElementById('admin-search-input');
    dom.btnClearSearch = document.getElementById('btn-clear-search');
    dom.adminSortSelect = document.getElementById('admin-sort-select');
    dom.btnExportCsv = document.getElementById('btn-export-csv');
    dom.adminListSummary = document.getElementById('admin-list-summary');
    dom.adminQuestionPreview = document.getElementById('admin-question-preview');
    dom.adminResponseList = document.getElementById('admin-response-list');

    // 配置模态框
    dom.configModal = document.getElementById('config-modal');
    dom.btnCloseModal = document.getElementById('btn-close-modal');
    dom.configModeNotice = document.getElementById('config-mode-notice');
    dom.cfgSupabaseUrl = document.getElementById('cfg-supabase-url');
    dom.cfgSupabaseKey = document.getElementById('cfg-supabase-key');
    dom.btnResetConfig = document.getElementById('btn-reset-config');
    dom.btnSaveConfig = document.getElementById('btn-save-config');

    dom.toastContainer = document.getElementById('toast-container');
  }

  // ==================== 工具函数 ====================
  function showToast(message, type = 'info', duration = 2600) {
    const toast = document.createElement('div');
    toast.className = `dd-toast ${type}`;
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.2s ease';
      setTimeout(() => toast.remove(), 220);
    }, duration);
  }

  function formatDateTime(isoStr) {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return String(isoStr);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function countWords(text) {
    if (!text) return 0;
    // 去除首尾空白及换行符后的有效字符长度
    return String(text).replace(/\s+/g, '').length;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function highlightKeyword(text, keyword) {
    const safeText = escapeHtml(text);
    if (!keyword || !keyword.trim()) return safeText;
    const escapedKw = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedKw})`, 'gi');
    return safeText.replace(regex, '<mark class="kw-highlight">$1</mark>');
  }

  // ==================== Supabase 初始化与本地演示回退机制 ====================
  function getEffectiveSupabaseCredentials() {
    let url = (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '').trim();
    let key = (typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : '').trim();

    try {
      const savedRaw = localStorage.getItem(SURVEY_META.storageKeyRuntimeConfig);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        if (parsed.url && parsed.key) {
          url = parsed.url.trim();
          key = parsed.key.trim();
        }
      }
    } catch (e) {
      // ignore storage error
    }

    // 自动标准化 URL（去除末尾可能附带的 /rest/v1/ 或斜杠）
    url = url.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');

    const isPlaceholder =
      !url ||
      !key ||
      url.includes('your-project-id.supabase.co') ||
      key.includes('your-supabase-anon-public-key');

    return { url, key, isValid: !isPlaceholder && /^https?:\/\//i.test(url) };
  }

  /**
   * 内置轻量级 Supabase PostgREST 兼容客户端
   * 当国内移动网络下 CDN (jsdelivr) 加载缓慢或受阻时，自动使用原生 fetch 直连 Supabase REST API，
   * 确保在钉钉移动端内 100% 稳定读写云端数据库。
   */
  function createFallbackSupabaseClient(baseUrl, apiKey) {
    const headers = {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };

    return {
      from(table) {
        const stateObj = {
          method: 'GET',
          selectCols: '*',
          filters: [],
          orderCol: null,
          orderAsc: false,
          upsertBody: null,
          onConflictCol: null,
          expectSingle: false,
          expectMaybeSingle: false
        };

        const builder = {
          select(cols = '*') {
            stateObj.selectCols = cols.replace(/\s+/g, '');
            return builder;
          },
          eq(col, val) {
            stateObj.filters.push(`${encodeURIComponent(col)}=eq.${encodeURIComponent(val)}`);
            return builder;
          },
          order(col, { ascending = true } = {}) {
            stateObj.orderCol = col;
            stateObj.orderAsc = ascending;
            return builder;
          },
          upsert(payload, { onConflict } = {}) {
            stateObj.method = 'POST';
            stateObj.upsertBody = payload;
            stateObj.onConflictCol = onConflict || 'name';
            return builder;
          },
          single() {
            stateObj.expectSingle = true;
            return builder._exec();
          },
          maybeSingle() {
            stateObj.expectMaybeSingle = true;
            return builder._exec();
          },
          then(resolve, reject) {
            return builder._exec().then(resolve, reject);
          },
          async _exec() {
            try {
              const params = [`select=${encodeURIComponent(stateObj.selectCols)}`];
              if (stateObj.onConflictCol) {
                params.push(`on_conflict=${encodeURIComponent(stateObj.onConflictCol)}`);
              }
              if (stateObj.filters.length > 0) {
                params.push(...stateObj.filters);
              }
              if (stateObj.orderCol) {
                params.push(`order=${encodeURIComponent(stateObj.orderCol)}.${stateObj.orderAsc ? 'asc' : 'desc'}`);
              }

              const queryStr = `${encodeURIComponent(table)}?${params.join('&')}`;
              const reqHeaders = { ...headers };
              if (stateObj.method === 'POST') {
                reqHeaders.Prefer = 'resolution=merge-duplicates,return=representation';
              }

              // 仅在支持反向代理的托管环境才尝试同源 /rest/v1/，GitHub Pages / Surge 直接走 Supabase 云端接口
              const isProxyCapableHost =
                /^https?:\/\//i.test(window.location.origin) &&
                !/localhost|127\.0\.0\.1|\.github\.io$|\.surge\.sh$/i.test(window.location.hostname);
              const candidateUrls = isProxyCapableHost
                ? [`${window.location.origin}/rest/v1/${queryStr}`, `${baseUrl}/rest/v1/${queryStr}`]
                : [`${baseUrl}/rest/v1/${queryStr}`];

              let resp = null;
              let lastErr = null;
              for (const reqUrl of candidateUrls) {
                try {
                  const r = await fetch(reqUrl, {
                    method: stateObj.method,
                    headers: reqHeaders,
                    body: stateObj.upsertBody ? JSON.stringify(stateObj.upsertBody) : undefined
                  });
                  // 如果同源没有配置反向代理返回 404/405 HTML，则回退直连 Supabase
                  const contentType = r.headers.get('content-type') || '';
                  if ((r.status === 404 || r.status === 405) && contentType.includes('text/html') && candidateUrls.length > 1 && reqUrl === candidateUrls[0]) {
                    continue;
                  }
                  resp = r;
                  break;
                } catch (e) {
                  lastErr = e;
                }
              }
              if (!resp) {
                throw lastErr || new Error('网络请求失败');
              }

              if (!resp.ok) {
                const errText = await resp.text();
                let errMsg = `HTTP ${resp.status}`;
                try {
                  const errJson = JSON.parse(errText);
                  errMsg = errJson.message || errJson.error || errMsg;
                } catch (e) {
                  if (errText) errMsg = errText;
                }
                return { data: null, error: { message: errMsg } };
              }

              const rows = await resp.json();
              if (stateObj.expectSingle) {
                return { data: Array.isArray(rows) ? rows[0] || null : rows, error: null };
              }
              if (stateObj.expectMaybeSingle) {
                return { data: Array.isArray(rows) ? rows[0] || null : rows, error: null };
              }
              return { data: rows, error: null };
            } catch (networkErr) {
              return { data: null, error: { message: networkErr.message || '网络请求失败' } };
            }
          }
        };

        return builder;
      }
    };
  }

  function initDatabaseClient() {
    const { url, key, isValid } = getEffectiveSupabaseCredentials();
    if (isValid) {
      try {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
          state.supabase = window.supabase.createClient(url, key);
        } else {
          state.supabase = createFallbackSupabaseClient(url, key);
        }
        state.isCloudMode = true;
        dom.dbStatusDot.className = 'status-dot online';
        dom.dbStatusText.textContent = 'Supabase 云端已连接';
        return;
      } catch (err) {
        console.error('Supabase 初始化异常，切换至直连客户端:', err);
        state.supabase = createFallbackSupabaseClient(url, key);
        state.isCloudMode = true;
        dom.dbStatusDot.className = 'status-dot online';
        dom.dbStatusText.textContent = 'Supabase 云端已连接';
        return;
      }
    }

    // 未配置有效 Supabase 密钥时，自动启用浏览器本地持久化演示层
    state.supabase = null;
    state.isCloudMode = false;
    dom.dbStatusDot.className = 'status-dot demo';
    dom.dbStatusText.textContent = '本地演示模式 (点击配置云端)';
    ensureLocalDemoSeedData();
  }

  function ensureLocalDemoSeedData() {
    try {
      const raw = localStorage.getItem(SURVEY_META.storageKeyLocalMockRows);
      if (!raw) {
        localStorage.setItem(SURVEY_META.storageKeyLocalMockRows, JSON.stringify([]));
      }
    } catch (e) {
      // ignore
    }
  }

  function getLocalDemoRows() {
    try {
      const raw = localStorage.getItem(SURVEY_META.storageKeyLocalMockRows);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveLocalDemoRows(rows) {
    try {
      localStorage.setItem(SURVEY_META.storageKeyLocalMockRows, JSON.stringify(rows));
    } catch (e) {
      // ignore
    }
  }

  /**
   * 按姓名查询 survey_responses 表记录
   */
  async function dbQueryByName(name) {
    const trimmed = name.trim();
    if (!trimmed) return null;

    if (state.isCloudMode && state.supabase) {
      const { data, error } = await state.supabase
        .from(SURVEY_META.tableName)
        .select('id, name, answer, edit_count, created_at, updated_at')
        .eq('name', trimmed)
        .maybeSingle();

      if (error) {
        throw new Error(error.message || '查询数据库失败');
      }
      return data || null;
    } else {
      const rows = getLocalDemoRows();
      return rows.find((r) => r.name === trimmed) || null;
    }
  }

  /**
   * 使用 upsert (onConflict: 'name') 提交或覆盖更新记录
   * 首次提交记录 created_at，edit_count = 0；
   * 后续修改更新 updated_at 并累加 edit_count
   */
  async function dbUpsertResponse(name, answerText) {
    const trimmedName = name.trim();
    const nowIso = new Date().toISOString();

    // 先核实数据库中是否已存在该姓名的记录，确保 created_at 与 edit_count 准确无误
    const existing = await dbQueryByName(trimmedName);
    const isUpdate = Boolean(existing);
    const payload = {
      name: trimmedName,
      answer: answerText,
      created_at: existing ? existing.created_at : nowIso,
      updated_at: nowIso,
      edit_count: existing ? (Number(existing.edit_count) || 0) + 1 : 0
    };

    if (state.isCloudMode && state.supabase) {
      const { data, error } = await state.supabase
        .from(SURVEY_META.tableName)
        .upsert(payload, { onConflict: 'name' })
        .select('id, name, answer, edit_count, created_at, updated_at')
        .single();

      if (error) {
        throw new Error(error.message || '提交保存失败');
      }
      return { record: data, isUpdate };
    } else {
      const rows = getLocalDemoRows();
      const idx = rows.findIndex((r) => r.name === trimmedName);
      const savedRecord = {
        id: existing ? existing.id : 'local_' + Date.now(),
        ...payload
      };
      if (idx >= 0) {
        rows[idx] = savedRecord;
      } else {
        rows.unshift(savedRecord);
      }
      saveLocalDemoRows(rows);
      return { record: savedRecord, isUpdate };
    }
  }

  /**
   * 管理员后台获取全部回答记录
   */
  async function dbFetchAllResponses() {
    if (state.isCloudMode && state.supabase) {
      const { data, error } = await state.supabase
        .from(SURVEY_META.tableName)
        .select('id, name, answer, edit_count, created_at, updated_at')
        .order('updated_at', { ascending: false });

      if (error) {
        throw new Error(error.message || '加载回答列表失败');
      }
      return data || [];
    } else {
      const rows = getLocalDemoRows();
      return [...rows].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    }
  }

  // ==================== 问卷题目渲染与答案读写 ====================
  function renderQuestions() {
    dom.questionsContainer.innerHTML = '';

    QUESTIONS.forEach((q, idx) => {
      const card = document.createElement('div');
      card.className = 'dd-card question-card';

      const indexLabel = QUESTIONS.length > 1 ? `第 ${idx + 1} 题` : '简答题';
      const reqStar = q.required !== false ? '<span class="required-star">*</span>' : '';

      card.innerHTML = `
        <div class="question-badge-row">
          <span class="question-type-tag">${escapeHtml(indexLabel)}</span>
          <span class="word-counter" id="counter-${escapeHtml(q.id)}">已输入 <strong>0</strong> 字</span>
        </div>
        <label for="input-${escapeHtml(q.id)}" class="question-title">
          ${escapeHtml(q.title)} ${reqStar}
        </label>
        <textarea
          id="input-${escapeHtml(q.id)}"
          data-qid="${escapeHtml(q.id)}"
          class="dd-textarea question-textarea"
          placeholder="${escapeHtml(q.placeholder || '请输入您的回答...')}"
          rows="6"
          ${q.required !== false ? 'required' : ''}
        ></textarea>
        <div class="textarea-footer">
          <span>支持换行分段填写，可随时按姓名重新打开修改</span>
        </div>
      `;

      dom.questionsContainer.appendChild(card);

      const textarea = card.querySelector('textarea');
      const counterEl = card.querySelector(`#counter-${q.id} strong`);
      textarea.addEventListener('input', () => {
        counterEl.textContent = String(countWords(textarea.value));
      });
    });

    if (QUESTIONS.length > 0 && dom.adminQuestionPreview) {
      dom.adminQuestionPreview.textContent = `当前题目：${QUESTIONS[0].title}`;
      dom.adminQuestionPreview.title = QUESTIONS[0].title;
    }
  }

  /**
   * 将数据库中的 answer 字符串回显到题目输入框
   */
  function fillAnswerIntoInputs(answerText) {
    const textareas = dom.questionsContainer.querySelectorAll('.question-textarea');
    if (textareas.length === 0) return;

    if (textareas.length === 1) {
      textareas[0].value = answerText || '';
      const qid = textareas[0].getAttribute('data-qid');
      const counterStrong = document.querySelector(`#counter-${qid} strong`);
      if (counterStrong) {
        counterStrong.textContent = String(countWords(textareas[0].value));
      }
      return;
    }

    // 若配置了多道题，支持 JSON 或分段解析回显
    try {
      const parsed = JSON.parse(answerText);
      if (parsed && typeof parsed === 'object') {
        textareas.forEach((ta) => {
          const qid = ta.getAttribute('data-qid');
          ta.value = parsed[qid] || '';
          const counterStrong = document.querySelector(`#counter-${qid} strong`);
          if (counterStrong) counterStrong.textContent = String(countWords(ta.value));
        });
        return;
      }
    } catch (e) {
      // 非 JSON 格式则填入第一题
      textareas[0].value = answerText || '';
    }
  }

  /**
   * 收集所有题目输入框中的回答内容
   */
  function collectAnswersFromInputs() {
    const textareas = Array.from(dom.questionsContainer.querySelectorAll('.question-textarea'));
    if (textareas.length === 1) {
      return textareas[0].value.trim();
    }
    const resultObj = {};
    textareas.forEach((ta) => {
      resultObj[ta.getAttribute('data-qid')] = ta.value.trim();
    });
    return JSON.stringify(resultObj);
  }

  // ==================== 按姓名查询并回显历史记录 ====================
  async function lookupHistoryByName(rawName, options = { manual: false }) {
    const trimmedName = (rawName || '').trim();
    dom.btnClearName.classList.toggle('hidden', !trimmedName);

    if (!trimmedName) {
      state.matchedRecord = null;
      state.lastQueriedName = '';
      dom.historyBanner.classList.add('hidden');
      dom.btnSubmitText.textContent = '提交问卷';
      if (options.manual) {
        showToast('请先输入您的姓名', 'error');
        dom.nameInput.focus();
      }
      return;
    }

    // 避免自动触发时重复请求相同姓名
    if (!options.manual && state.lastQueriedName === trimmedName) {
      return;
    }

    state.isQuerying = true;
    state.lastQueriedName = trimmedName;
    dom.btnQueryRecord.disabled = true;
    dom.btnQueryText.textContent = '查询中...';

    try {
      const record = await dbQueryByName(trimmedName);
      // 如果在异步请求期间用户已经把名字改成了别的，丢弃本次过期结果
      if (dom.nameInput.value.trim() !== trimmedName) {
        return;
      }

      if (record) {
        state.matchedRecord = record;
        // 缓存姓名到 localStorage
        try {
          localStorage.setItem(SURVEY_META.storageKeyName, trimmedName);
        } catch (e) {
          // ignore
        }

        // 将上次填写的答案回显到输入框中
        fillAnswerIntoInputs(record.answer || '');

        // 展示回显横幅提示
        dom.historyBanner.className = 'history-banner matched';
        dom.historyBannerIcon.textContent = '✓';
        dom.historyBannerTitle.textContent = '已加载您之前的回答，可直接修改并覆盖保存';
        const editCount = Number(record.edit_count) || 0;
        const editText = editCount > 0 ? `已修改 ${editCount} 次` : '首次提交记录';
        dom.historyBannerMeta.textContent = `上次保存时间：${formatDateTime(record.updated_at)}（${editText}）`;
        dom.btnSubmitText.textContent = '覆盖保存修改';

        if (options.manual) {
          showToast('已加载您之前的回答，可直接修改并覆盖保存', 'success');
        }
      } else {
        state.matchedRecord = null;
        dom.btnSubmitText.textContent = '提交问卷';

        if (options.manual) {
          dom.historyBanner.className = 'history-banner empty';
          dom.historyBannerIcon.textContent = 'i';
          dom.historyBannerTitle.textContent = `未查询到“${trimmedName}”的历史记录`;
          dom.historyBannerMeta.textContent = '您可以直接在下方填写答案并提交。';
          showToast('未查询到该姓名的已填记录，可直接填写', 'info');
        } else {
          dom.historyBanner.classList.add('hidden');
        }
      }
    } catch (err) {
      console.error('查询历史记录出错:', err);
      if (options.manual) {
        showToast(`查询失败：${err.message}`, 'error');
      }
    } finally {
      state.isQuerying = false;
      dom.btnQueryRecord.disabled = false;
      dom.btnQueryText.textContent = '查询已填记录';
    }
  }

  // ==================== 问卷提交处理 ====================
  async function handleSurveySubmit(e) {
    e.preventDefault();
    if (state.isSubmitting) return;

    const trimmedName = dom.nameInput.value.trim();
    if (!trimmedName) {
      showToast('请输入您的姓名（必填）', 'error');
      dom.nameInput.focus();
      return;
    }

    // 校验每道必答题
    const textareas = Array.from(dom.questionsContainer.querySelectorAll('.question-textarea'));
    for (let i = 0; i < QUESTIONS.length; i++) {
      const q = QUESTIONS[i];
      const ta = textareas[i];
      const val = (ta ? ta.value : '').trim();
      if (q.required !== false && !val) {
        showToast('请先填写问卷回答内容', 'error');
        if (ta) ta.focus();
        return;
      }
    }

    const finalAnswer = collectAnswersFromInputs();

    state.isSubmitting = true;
    dom.btnSubmit.disabled = true;
    const originalBtnLabel = dom.btnSubmitText.textContent;
    dom.btnSubmitText.textContent = '正在保存...';

    try {
      // 1. 将填写人姓名缓存在浏览器 localStorage
      try {
        localStorage.setItem(SURVEY_META.storageKeyName, trimmedName);
      } catch (err) {
        // ignore
      }

      // 2. 执行 Supabase upsert（onConflict: 'name'）
      const { record, isUpdate } = await dbUpsertResponse(trimmedName, finalAnswer);
      state.matchedRecord = record;
      state.lastQueriedName = trimmedName;

      // 3. 更新页面状态并展示成功反馈卡片
      dom.historyBanner.className = 'history-banner matched';
      dom.historyBannerIcon.textContent = '✓';
      dom.historyBannerTitle.textContent = '已加载您之前的回答，可直接修改并覆盖保存';
      const editCount = Number(record.edit_count) || 0;
      dom.historyBannerMeta.textContent = `上次保存时间：${formatDateTime(record.updated_at)}（${
        editCount > 0 ? `已修改 ${editCount} 次` : '首次提交记录'
      }）`;
      dom.btnSubmitText.textContent = '覆盖保存修改';

      // 显示成功面板
      dom.surveyForm.classList.add('hidden');
      dom.submitSuccessCard.classList.remove('hidden');
      dom.successTitle.textContent = isUpdate ? '修改覆盖保存成功！' : '问卷提交成功！';
      dom.successDesc.textContent = isUpdate
        ? '您的最新回答已成功覆盖保存，感谢您的补充与完善。'
        : '感谢您的认真填写，您的回答已成功录入系统。';

      dom.successMetaBox.innerHTML = `
        <div><strong>填写人姓名：</strong>${escapeHtml(record.name)}</div>
        <div><strong>回答字数：</strong>${countWords(record.answer)} 字</div>
        <div><strong>首次提交时间：</strong>${formatDateTime(record.created_at)}</div>
        <div><strong>最后修改时间：</strong>${formatDateTime(record.updated_at)}</div>
        <div><strong>累计修改次数：</strong>${editCount} 次</div>
      `;

      showToast(isUpdate ? '已覆盖保存最新回答' : '问卷提交成功', 'success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('提交问卷失败:', err);
      showToast(`提交失败：${err.message}`, 'error', 3500);
      dom.btnSubmitText.textContent = originalBtnLabel;
    } finally {
      state.isSubmitting = false;
      dom.btnSubmit.disabled = false;
    }
  }

  // ==================== 管理员后台逻辑 ====================
  function checkAdminSessionUnlocked() {
    try {
      return sessionStorage.getItem(SURVEY_META.storageKeyAdminAuth) === '1';
    } catch (e) {
      return false;
    }
  }

  function setAdminSessionUnlocked(unlocked) {
    state.isAdminUnlocked = unlocked;
    try {
      if (unlocked) {
        sessionStorage.setItem(SURVEY_META.storageKeyAdminAuth, '1');
      } else {
        sessionStorage.removeItem(SURVEY_META.storageKeyAdminAuth);
      }
    } catch (e) {
      // ignore
    }
    updateAdminViewVisibility();
  }

  function updateAdminViewVisibility() {
    if (state.isAdminUnlocked) {
      dom.adminAuthCard.classList.add('hidden');
      dom.adminDashboard.classList.remove('hidden');
      loadAdminData();
    } else {
      dom.adminAuthCard.classList.remove('hidden');
      dom.adminDashboard.classList.add('hidden');
    }
  }

  function handleAdminLogin(e) {
    e.preventDefault();
    const inputPwd = dom.adminPasswordInput.value;
    const targetPwd = typeof ADMIN_PASSWORD !== 'undefined' ? ADMIN_PASSWORD : 'admin888';

    if (inputPwd === targetPwd) {
      dom.adminAuthError.classList.add('hidden');
      dom.adminPasswordInput.value = '';
      setAdminSessionUnlocked(true);
      showToast('管理员权限已解锁', 'success');
    } else {
      dom.adminAuthError.classList.remove('hidden');
      dom.adminPasswordInput.select();
    }
  }

  async function loadAdminData() {
    dom.btnRefreshAdmin.disabled = true;
    try {
      const records = await dbFetchAllResponses();
      state.adminRecords = records;
      dom.adminLastSync.textContent = `更新于 ${formatDateTime(new Date().toISOString()).slice(11)}`;
      renderAdminStats();
      renderAdminList();
    } catch (err) {
      console.error('加载后台数据失败:', err);
      showToast(`加载后台数据失败：${err.message}`, 'error');
    } finally {
      dom.btnRefreshAdmin.disabled = false;
    }
  }

  /**
   * 渲染后台统计卡片（已提交总人数、二次修改人数、平均回答字数）
   */
  function renderAdminStats() {
    const records = state.adminRecords || [];
    const totalCount = records.length;
    const modifiedCount = records.filter((r) => (Number(r.edit_count) || 0) > 0).length;

    let totalWords = 0;
    let maxWords = 0;
    records.forEach((r) => {
      const w = countWords(r.answer);
      totalWords += w;
      if (w > maxWords) maxWords = w;
    });

    const avgWords = totalCount > 0 ? Math.round(totalWords / totalCount) : 0;
    const modifiedRatio = totalCount > 0 ? Math.round((modifiedCount / totalCount) * 100) : 0;

    dom.statTotalCount.textContent = String(totalCount);
    dom.statTotalFoot.textContent = state.isCloudMode ? '云端实时汇总' : '本地演示数据';

    dom.statModifiedCount.textContent = String(modifiedCount);
    dom.statModifiedFoot.textContent = `占总人数 ${modifiedRatio}%`;

    dom.statAvgWords.textContent = String(avgWords);
    dom.statWordsFoot.textContent = `单篇最高 ${maxWords} 字`;
  }

  /**
   * 获取经过实时搜索过滤与排序后的记录数组
   */
  function getFilteredAndSortedAdminRecords() {
    const kw = (state.searchKeyword || '').trim().toLowerCase();
    let list = (state.adminRecords || []).filter((item) => {
      if (!kw) return true;
      const nameMatch = String(item.name || '').toLowerCase().includes(kw);
      const answerMatch = String(item.answer || '').toLowerCase().includes(kw);
      return nameMatch || answerMatch;
    });

    const sortMode = state.sortMode || 'updated_desc';
    list.sort((a, b) => {
      if (sortMode === 'updated_desc') {
        return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
      }
      if (sortMode === 'updated_asc') {
        return new Date(a.updated_at || 0) - new Date(b.updated_at || 0);
      }
      if (sortMode === 'created_desc') {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
      if (sortMode === 'created_asc') {
        return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      }
      if (sortMode === 'words_desc') {
        return countWords(b.answer) - countWords(a.answer);
      }
      return 0;
    });

    return list;
  }

  /**
   * 渲染后台回答记录列表
   */
  function renderAdminList() {
    const filtered = getFilteredAndSortedAdminRecords();
    const total = (state.adminRecords || []).length;
    const kw = (state.searchKeyword || '').trim();

    dom.adminListSummary.textContent = kw
      ? `筛选出 ${filtered.length} 条记录（共 ${total} 人已提交）`
      : `共 ${total} 条回答记录`;

    if (filtered.length === 0) {
      dom.adminResponseList.innerHTML = `
        <div class="empty-state">
          <p>${kw ? '未找到匹配该关键词的姓名或回答记录' : '暂无人员提交问卷回答'}</p>
        </div>
      `;
      return;
    }

    dom.adminResponseList.innerHTML = filtered
      .map((item) => {
        const nameStr = item.name || '未命名';
        const avatarChar = nameStr.trim().slice(-2) || '网管';
        const wordCount = countWords(item.answer);
        const editCount = Number(item.edit_count) || 0;
        const editBadge =
          editCount > 0
            ? `<span class="badge-tag badge-edited">已修改 ${editCount} 次</span>`
            : `<span class="badge-tag badge-first">首次提交</span>`;

        return `
          <article class="response-item">
            <div class="resp-header">
              <div class="resp-user">
                <span class="resp-avatar">${escapeHtml(avatarChar)}</span>
                <span class="resp-name">${highlightKeyword(nameStr, kw)}</span>
              </div>
              <div class="resp-badges">
                ${editBadge}
                <span class="badge-tag badge-words">${wordCount} 字</span>
              </div>
            </div>
            <div class="resp-content">${highlightKeyword(item.answer || '', kw)}</div>
            <div class="resp-footer">
              <div class="resp-times">
                <span>首次提交：${formatDateTime(item.created_at)}</span>
                <span>最后修改：${formatDateTime(item.updated_at)}</span>
              </div>
              <button type="button" class="btn-copy-answer" data-name="${escapeHtml(nameStr)}" data-answer="${escapeHtml(item.answer || '')}">
                复制回答
              </button>
            </div>
          </article>
        `;
      })
      .join('');
  }

  /**
   * 一键导出带 \uFEFF UTF-8 BOM 头的 CSV 文件（确保 Excel 打开中文不乱码）
   * 包含：姓名、回答内容、首次提交时间、最后修改时间、回答字数（及修改次数）
   */
  function handleExportCsv() {
    const records = getFilteredAndSortedAdminRecords();
    if (records.length === 0) {
      showToast('当前没有可导出的回答记录', 'error');
      return;
    }

    const escapeCsvCell = (val) => {
      const str = String(val ?? '');
      // 将双引号转义为两个双引号，并用双引号包裹字段以兼容换行符、逗号
      return `"${str.replace(/"/g, '""')}"`;
    };

    const headers = ['姓名', '回答内容', '首次提交时间', '最后修改时间', '回答字数', '修改次数'];
    const rows = records.map((r) => [
      escapeCsvCell(r.name || ''),
      escapeCsvCell(r.answer || ''),
      escapeCsvCell(formatDateTime(r.created_at)),
      escapeCsvCell(formatDateTime(r.updated_at)),
      escapeCsvCell(countWords(r.answer)),
      escapeCsvCell(Number(r.edit_count) || 0)
    ]);

    const csvBody = [headers.map(escapeCsvCell).join(','), ...rows.map((row) => row.join(','))].join('\r\n');
    // 添加 \uFEFF UTF-8 BOM 头，保证 Windows / Mac Excel 直接双击打开中文不乱码
    const bomCsv = '\uFEFF' + csvBody;

    const blob = new Blob([bomCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateTag = formatDateTime(new Date().toISOString()).slice(0, 10).replace(/-/g, '');
    link.href = url;
    link.download = `区域网管调查问卷汇总_${dateTag}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showToast(`已成功导出 ${records.length} 条记录`, 'success');
  }

  // ==================== 路由切换 (#/ 与 #/admin) ====================
  function syncRouteFromHash() {
    const hash = window.location.hash || '#/';
    const isAdminRoute = hash === '#/admin' || hash === '#admin' || hash.startsWith('#/admin?');

    state.currentRoute = isAdminRoute ? 'admin' : 'survey';

    if (isAdminRoute) {
      dom.tabSurvey.classList.remove('active');
      dom.tabSurvey.setAttribute('aria-selected', 'false');
      dom.tabAdmin.classList.add('active');
      dom.tabAdmin.setAttribute('aria-selected', 'true');

      dom.viewSurvey.classList.add('hidden');
      dom.viewAdmin.classList.remove('hidden');
      updateAdminViewVisibility();
    } else {
      dom.tabAdmin.classList.remove('active');
      dom.tabAdmin.setAttribute('aria-selected', 'false');
      dom.tabSurvey.classList.add('active');
      dom.tabSurvey.setAttribute('aria-selected', 'true');

      dom.viewAdmin.classList.add('hidden');
      dom.viewSurvey.classList.remove('hidden');
    }
  }

  // ==================== 在线数据库配置弹窗逻辑 ====================
  function openConfigModal() {
    const { url, key, isValid } = getEffectiveSupabaseCredentials();
    dom.cfgSupabaseUrl.value = isValid ? url : '';
    dom.cfgSupabaseKey.value = isValid ? key : '';

    if (state.isCloudMode) {
      dom.configModeNotice.className = 'mode-notice online';
      dom.configModeNotice.textContent = '当前状态：已连接至 Supabase 云端数据库（survey_responses 表）。';
    } else {
      dom.configModeNotice.className = 'mode-notice demo';
      dom.configModeNotice.textContent =
        '当前状态：未检测到有效 Supabase 密钥，正处于浏览器本地演示模式。您可以在 config.js 中配置，或在下方直接填入您的 Supabase URL 与 Anon Key 立即切换至云端数据库。';
    }

    dom.configModal.classList.remove('hidden');
  }

  function closeConfigModal() {
    dom.configModal.classList.add('hidden');
  }

  function saveRuntimeSupabaseConfig() {
    const url = dom.cfgSupabaseUrl.value.trim();
    const key = dom.cfgSupabaseKey.value.trim();

    if (!url || !key) {
      showToast('请同时填写 Supabase Project URL 和 Anon Key', 'error');
      return;
    }

    try {
      localStorage.setItem(SURVEY_META.storageKeyRuntimeConfig, JSON.stringify({ url, key }));
    } catch (e) {
      // ignore
    }

    initDatabaseClient();
    closeConfigModal();
    showToast(state.isCloudMode ? '已切换至 Supabase 云端数据库' : '配置已保存', 'success');

    // 重新触发当前视图的数据查询
    state.lastQueriedName = null;
    if (state.currentRoute === 'admin' && state.isAdminUnlocked) {
      loadAdminData();
    } else if (dom.nameInput.value.trim()) {
      lookupHistoryByName(dom.nameInput.value.trim(), { manual: false });
    }
  }

  function resetRuntimeSupabaseConfig() {
    try {
      localStorage.removeItem(SURVEY_META.storageKeyRuntimeConfig);
    } catch (e) {
      // ignore
    }
    initDatabaseClient();
    closeConfigModal();
    showToast('已恢复为 config.js 默认配置', 'info');
  }

  // ==================== 事件绑定与初始化 ====================
  function bindEvents() {
    window.addEventListener('hashchange', syncRouteFromHash);

    // 姓名输入防抖自动匹配 + 失焦匹配 + 按钮手动匹配
    dom.nameInput.addEventListener('input', () => {
      const val = dom.nameInput.value;
      dom.btnClearName.classList.toggle('hidden', !val.trim());

      if (state.nameDebounceTimer) {
        clearTimeout(state.nameDebounceTimer);
      }
      state.nameDebounceTimer = setTimeout(() => {
        lookupHistoryByName(val, { manual: false });
      }, 480);
    });

    dom.nameInput.addEventListener('blur', () => {
      if (state.nameDebounceTimer) {
        clearTimeout(state.nameDebounceTimer);
      }
      const val = dom.nameInput.value.trim();
      if (val) {
        lookupHistoryByName(val, { manual: false });
      }
    });

    dom.btnClearName.addEventListener('click', () => {
      dom.nameInput.value = '';
      dom.btnClearName.classList.add('hidden');
      state.matchedRecord = null;
      state.lastQueriedName = '';
      dom.historyBanner.classList.add('hidden');
      dom.btnSubmitText.textContent = '提交问卷';
      fillAnswerIntoInputs('');
      dom.nameInput.focus();
    });

    dom.btnQueryRecord.addEventListener('click', () => {
      if (state.nameDebounceTimer) {
        clearTimeout(state.nameDebounceTimer);
      }
      lookupHistoryByName(dom.nameInput.value, { manual: true });
    });

    // 提交问卷
    dom.surveyForm.addEventListener('submit', handleSurveySubmit);

    // 提交成功后点击“继续修改我的回答”
    dom.btnContinueEdit.addEventListener('click', () => {
      dom.submitSuccessCard.classList.add('hidden');
      dom.surveyForm.classList.remove('hidden');
      const firstTextarea = dom.questionsContainer.querySelector('.question-textarea');
      if (firstTextarea) firstTextarea.focus();
    });

    // 管理员密码显示/隐藏切换
    dom.btnTogglePwd.addEventListener('click', () => {
      const isPwd = dom.adminPasswordInput.type === 'password';
      dom.adminPasswordInput.type = isPwd ? 'text' : 'password';
      dom.btnTogglePwd.textContent = isPwd ? '隐藏' : '显示';
    });

    // 管理员登录与锁定
    dom.adminLoginForm.addEventListener('submit', handleAdminLogin);
    dom.btnRefreshAdmin.addEventListener('click', loadAdminData);
    dom.btnLockAdmin.addEventListener('click', () => {
      setAdminSessionUnlocked(false);
      showToast('已退出管理员后台', 'info');
    });

    // 管理员实时搜索与排序
    dom.adminSearchInput.addEventListener('input', () => {
      state.searchKeyword = dom.adminSearchInput.value;
      dom.btnClearSearch.classList.toggle('hidden', !state.searchKeyword.trim());
      renderAdminList();
    });

    dom.btnClearSearch.addEventListener('click', () => {
      dom.adminSearchInput.value = '';
      state.searchKeyword = '';
      dom.btnClearSearch.classList.add('hidden');
      renderAdminList();
    });

    dom.adminSortSelect.addEventListener('change', () => {
      state.sortMode = dom.adminSortSelect.value;
      renderAdminList();
    });

    // 导出 CSV
    dom.btnExportCsv.addEventListener('click', handleExportCsv);

    // 列表内“复制回答”按钮事件委托
    dom.adminResponseList.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn-copy-answer');
      if (!btn) return;
      const name = btn.getAttribute('data-name') || '';
      const answer = btn.getAttribute('data-answer') || '';
      const copyText = `【${name}】的回答：\n${answer}`;
      try {
        await navigator.clipboard.writeText(copyText);
        showToast(`已复制 ${name} 的回答内容`, 'success');
      } catch (err) {
        showToast('复制失败，请手动长按选择复制', 'error');
      }
    });

    // 数据库配置模态框
    dom.btnDbStatus.addEventListener('click', openConfigModal);
    dom.btnCloseModal.addEventListener('click', closeConfigModal);
    dom.configModal.addEventListener('click', (e) => {
      if (e.target === dom.configModal) closeConfigModal();
    });
    dom.btnSaveConfig.addEventListener('click', saveRuntimeSupabaseConfig);
    dom.btnResetConfig.addEventListener('click', resetRuntimeSupabaseConfig);
  }

  function initApp() {
    cacheDom();

    // 初始化页面标题与配置文案
    if (typeof SURVEY_META !== 'undefined') {
      document.title = SURVEY_META.title || document.title;
      dom.headerTitle.textContent = SURVEY_META.title || dom.headerTitle.textContent;
      dom.headerSubtitle.textContent = SURVEY_META.subtitle || dom.headerSubtitle.textContent;
      dom.headerDept.textContent = SURVEY_META.department || dom.headerDept.textContent;
    }

    initDatabaseClient();
    renderQuestions();
    state.isAdminUnlocked = checkAdminSessionUnlocked();
    bindEvents();
    syncRouteFromHash();

    // 自动读取 localStorage 中缓存的填写人姓名并加载历史答案
    try {
      const cachedName = (localStorage.getItem(SURVEY_META.storageKeyName) || '').trim();
      if (cachedName) {
        dom.nameInput.value = cachedName;
        dom.btnClearName.classList.remove('hidden');
        lookupHistoryByName(cachedName, { manual: false });
      }
    } catch (e) {
      // ignore storage error
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
