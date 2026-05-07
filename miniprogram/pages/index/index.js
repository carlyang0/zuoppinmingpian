const STORAGE_KEY = "portfolioMiniDraft";

const identityOptions = [
  "AI 产品经理",
  "AI 产品与增长实践者",
  "独立开发者",
  "增长运营",
  "内容创作者",
  "自由职业者",
  "活动策划"
];

const purposes = [
  {
    label: "找工作",
    title: "求职能力证明",
    cta: "欢迎联系我交流岗位机会"
  },
  {
    label: "接单",
    title: "接单能力证明",
    cta: "欢迎联系我沟通项目合作"
  },
  {
    label: "找合作",
    title: "合作介绍页",
    cta: "欢迎联系我聊聊合作可能"
  },
  {
    label: "做个人品牌",
    title: "个人品牌页",
    cta: "欢迎关注我的持续实践"
  }
];

const typeOptions = [
  { label: "产品 / 工具", value: "product" },
  { label: "文章", value: "article" },
  { label: "视频", value: "video" },
  { label: "活动", value: "event" },
  { label: "项目案例", value: "case" },
  { label: "其他", value: "other" }
];

const skillMap = {
  product: ["AI 产品设计", "MVP 验证", "用户场景拆解"],
  article: ["内容表达", "行业分析", "观点输出"],
  video: ["视频策划", "内容传播", "用户理解"],
  event: ["活动策划", "资源整合", "现场执行"],
  case: ["项目复盘", "问题拆解", "商业理解"],
  other: ["跨领域实践", "执行力", "学习能力"]
};

const portfolioTypeMap = {
  product: { title: "AI / 产品作品", icon: "AI", color: "#7c3aed", bg: "#ede9fe" },
  article: { title: "文章作品", icon: "文", color: "#db2777", bg: "#fce7f3" },
  video: { title: "视频作品", icon: "播", color: "#2563eb", bg: "#dbeafe" },
  event: { title: "活动与运营案例", icon: "活", color: "#059669", bg: "#d1fae5" },
  case: { title: "项目案例", icon: "案", color: "#dc2626", bg: "#fee2e2" },
  other: { title: "其他作品", icon: "作", color: "#f59e0b", bg: "#fef3c7" }
};

function createEmptyWork() {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: "",
    typeIndex: 0,
    url: "",
    desc: "",
    background: "",
    role: "",
    result: "",
    proof: "",
    expanded: false
  };
}

function normalizeUrl(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (/^(https?:|mailto:)/i.test(candidate)) return candidate;
  return "";
}

function inferSummary(work) {
  const source = [work.desc, work.background, work.result].filter(Boolean).join(" ");
  if (source.length > 18) return source.slice(0, 64) + (source.length > 64 ? "..." : "");
  return "用于展示具体实践、问题解决和执行能力。";
}

function credibilityScore(works) {
  let score = 40;
  works.forEach((work) => {
    const text = [work.desc, work.background, work.role, work.result, work.proof].join(" ");
    if (work.desc.length > 18) score += 8;
    if (work.url) score += 5;
    if (work.background) score += 3;
    if (work.role) score += 3;
    if (work.result.length > 12) score += 7;
    if (work.proof || /截图|评价|反馈|链接|视频|数据|看板|证明|推荐|复盘/.test(text)) score += 5;
    if (/用户|访问|收入|报名|增长|数据|反馈|转化|播放|阅读|成交|GMV|UV|PV|下载|客户|提升|降低|节省|完成|上线|\d/.test(text)) score += 6;
  });
  return Math.min(95, score);
}

function missingTips(works) {
  const tips = [];
  if (works.some((work) => !work.desc && !work.background)) {
    tips.push("有些作品还只有标题，补几句素材后会更容易看出你的能力。");
  }
  if (works.some((work) => !work.url && !work.proof)) {
    tips.push("部分作品缺少可验证材料，建议补链接、截图、视频或用户反馈。");
  }
  if (!works.some((work) => /用户|访问|收入|报名|增长|数据|反馈|转化|播放|阅读|成交|GMV|UV|PV|下载|客户|提升|降低|节省|完成|上线|\d/.test([work.desc, work.result].join(" ")))) {
    tips.push("如果有结果数据，建议补一个数字，例如访问量、用户反馈、报名数或上线结果。");
  }
  if (works.length < 3) tips.push("建议整理 3-5 个代表作品，让能力画像更完整。");
  if (!tips.length) tips.push("当前信息已经适合对外分享，后续可继续补充截图和第三方反馈。");
  return tips;
}

Page({
  data: {
    identityOptions,
    purposeLabels: purposes.map((item) => item.label),
    typeLabels: typeOptions.map((item) => item.label),
    profile: {
      name: "",
      identityIndex: 0,
      purposeIndex: 0,
      bio: "",
      contact: ""
    },
    works: [createEmptyWork()],
    portfolio: null,
    shareCopy: ""
  },

  onProfileInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      [`profile.${field}`]: event.detail.value
    });
  },

  onIdentityChange(event) {
    this.setData({
      "profile.identityIndex": Number(event.detail.value)
    });
  },

  onPurposeChange(event) {
    this.setData({
      "profile.purposeIndex": Number(event.detail.value)
    });
  },

  onWorkInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    const field = event.currentTarget.dataset.field;
    this.setData({
      [`works[${index}].${field}`]: event.detail.value
    });
  },

  onWorkTypeChange(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({
      [`works[${index}].typeIndex`]: Number(event.detail.value)
    });
  },

  toggleAdvanced(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({
      [`works[${index}].expanded`]: !this.data.works[index].expanded
    });
  },

  addWork() {
    this.setData({
      works: this.data.works.concat(createEmptyWork())
    });
  },

  removeWork(event) {
    const index = Number(event.currentTarget.dataset.index);
    const works = this.data.works.slice();
    works.splice(index, 1);
    this.setData({
      works: works.length ? works : [createEmptyWork()]
    });
  },

  getValidWorks() {
    return this.data.works
      .map((work) => {
        const type = typeOptions[work.typeIndex] || typeOptions[0];
        return {
          ...work,
          type: type.value,
          title: String(work.title || "").trim(),
          url: String(work.url || "").trim(),
          desc: String(work.desc || "").trim(),
          background: String(work.background || "").trim(),
          role: String(work.role || "").trim(),
          result: String(work.result || "").trim(),
          proof: String(work.proof || "").trim()
        };
      })
      .filter((work) => work.title || work.url || work.desc || work.background || work.role || work.result || work.proof);
  },

  generatePortfolio() {
    const works = this.getValidWorks();
    if (!works.length) {
      wx.showToast({ title: "请至少添加 1 个作品", icon: "none" });
      return;
    }

    const profile = this.data.profile;
    const purpose = purposes[profile.purposeIndex] || purposes[0];
    const name = String(profile.name || "").trim() || "未命名创作者";
    const identity = identityOptions[profile.identityIndex] || identityOptions[0];
    const bio = String(profile.bio || "").trim() || "我正在持续积累项目、内容与产品实践，希望把做过的事情转化为可验证的能力证明。";
    const contact = String(profile.contact || "").trim() || "请补充联系方式";
    const tagSet = {};

    works.forEach((work) => {
      (skillMap[work.type] || skillMap.other).forEach((tag) => {
        tagSet[tag] = true;
      });
    });

    const grouped = {};
    works.forEach((work) => {
      if (!grouped[work.type]) grouped[work.type] = [];
      grouped[work.type].push({
        ...work,
        safeUrl: normalizeUrl(work.url),
        summary: inferSummary(work)
      });
    });

    const blocks = Object.keys(grouped).map((type) => ({
      type,
      ...portfolioTypeMap[type],
      items: grouped[type]
    }));

    const portfolio = {
      name,
      initial: name[0] || "作",
      identity,
      purposeTitle: purpose.title,
      bio,
      contact,
      tags: Object.keys(tagSet).slice(0, 9),
      blocks,
      score: credibilityScore(works),
      tips: missingTips(works),
      cta: purpose.cta
    };

    this.setData({
      portfolio,
      shareCopy: `我是${name}，${identity}。这是我的作品名片，整理了${works.length}个代表作品和它们证明的能力。${purpose.cta}。`
    });

    this.saveDraft(false);
    wx.showToast({ title: "已生成", icon: "success" });
  },

  saveDraft(showMessage = true) {
    wx.setStorageSync(STORAGE_KEY, {
      profile: this.data.profile,
      works: this.data.works
    });
    if (showMessage) wx.showToast({ title: "草稿已保存", icon: "success" });
  },

  loadDraft() {
    const draft = wx.getStorageSync(STORAGE_KEY);
    if (!draft) {
      wx.showToast({ title: "暂无可恢复草稿", icon: "none" });
      return;
    }
    this.setData({
      profile: draft.profile || this.data.profile,
      works: draft.works && draft.works.length ? draft.works : [createEmptyWork()]
    });
    wx.showToast({ title: "草稿已恢复", icon: "success" });
  },

  copyShare() {
    if (!this.data.shareCopy) return;
    wx.setClipboardData({
      data: this.data.shareCopy,
      success: () => wx.showToast({ title: "已复制文案", icon: "success" })
    });
  },

  copyWorkLink(event) {
    const link = event.currentTarget.dataset.link;
    if (!link) return;
    wx.setClipboardData({
      data: link,
      success: () => wx.showToast({ title: "已复制链接", icon: "success" })
    });
  },

  fillDemo() {
    this.setData({
      profile: {
        name: "AS Lee",
        identityIndex: 1,
        purposeIndex: 2,
        bio: "我关注 AI 产品、增长和个人品牌建设，擅长用低成本工具快速验证产品想法，并通过内容和社群获得早期反馈。",
        contact: "微信：your-wechat / 邮箱：hello@example.com"
      },
      works: [
        {
          ...createEmptyWork(),
          title: "AI 作品名片生成器",
          typeIndex: 0,
          url: "https://example.com",
          desc: "做了一个帮助 AI 转型者和独立创作者整理作品的工具，用户粘贴经历后可以生成个人定位、作品卡片、能力标签和完整度建议。",
          background: "AI 转型者和独立创作者有很多零散经历，但缺少一个能说明能力的展示页。",
          role: "独立负责产品定义、页面原型、规则生成逻辑和早期演示。",
          result: "完成可演示版本，支持作品生成、草稿保存和分享文案复制。"
        },
        {
          ...createEmptyWork(),
          title: "AI 时代增长方法论文章",
          typeIndex: 1,
          desc: "写了一篇关于 AI 时代增长方法的文章，分析普通人如何用内容、社群和自动化工具做低成本验证。",
          result: "形成一篇可用于个人品牌展示的观点型文章。"
        },
        {
          ...createEmptyWork(),
          title: "AI 时代如何做需求优先级",
          typeIndex: 2,
          url: "https://www.bilibili.com/video/example",
          desc: "围绕 AI 产品早期验证，录制了一期需求优先级判断方法的视频内容。",
          result: "可作为产品思维和内容表达能力的展示材料。"
        },
        {
          ...createEmptyWork(),
          title: "2025 AI 大会执行方案",
          typeIndex: 3,
          url: "https://docs.qq.com/pdf/example",
          desc: "整理活动执行方案，覆盖策划、嘉宾邀请、社群运营和现场执行流程。",
          result: "沉淀为可复用的活动项目案例。"
        }
      ]
    });
    this.generatePortfolio();
  }
});
