export type KickoffTemplateTask = {
  template_task_key: string;
  title: string;
  description: string;
};

// Design Studio kickoff template (MVP)
// Keys must be stable forever (used for idempotency via bot.project_template_tasks).
export const KICKOFF_TEMPLATE_TASKS: KickoffTemplateTask[] = [
  {
    template_task_key: "kickoff_access",
    title: "Kickoff: собрать материалы и доступы",
    description:
      "Собрать доступы, ссылки, исходники, контекст.\n\nВыход: список ссылок/доступов + подтверждение, что всё открывается.",
  },
  {
    template_task_key: "brief_confirm",
    title: "Бриф: подтвердить цели и требования",
    description:
      "Уточнить цели, аудиторию, ограничения, сроки.\n\nВыход: краткий конспект + список вопросов/рисков.",
  },
  {
    template_task_key: "research_refs",
    title: "Исследование: референсы и конкуренты",
    description:
      "Собрать 5–10 референсов и короткий разбор (что нравится/что нет).\n\nВыход: таблица/список с выводами.",
  },
  {
    template_task_key: "moodboard",
    title: "Moodboard / визуальное направление",
    description:
      "Сформировать направление по стилю/тону/визуальным паттернам.\n\nВыход: moodboard + 2–3 тезиса по направлению.",
  },
  {
    template_task_key: "ia_structure",
    title: "Информационная архитектура / структура",
    description:
      "Сформировать структуру и ключевые экраны/страницы.\n\nВыход: карта/outline.",
  },
  {
    template_task_key: "wireframes",
    title: "Wireframes основных экранов",
    description:
      "Сделать базовые вайрфреймы ключевых экранов и потоков.\n\nВыход: wireframes + список открытых вопросов.",
  },
  {
    template_task_key: "concept",
    title: "Концепт: 1–2 варианта",
    description:
      "Собрать концептуальные варианты на базе вайрфреймов и moodboard.\n\nВыход: 1–2 варианта + rationale.",
  },
  {
    template_task_key: "ui_kit",
    title: "UI kit / компоненты (база)",
    description:
      "Собрать базовый набор компонентов/стилей.\n\nВыход: UI kit, готовый к масштабированию.",
  },
  {
    template_task_key: "designs_key",
    title: "Макеты: ключевые экраны (MVP)",
    description:
      "Отрисовать ключевые экраны до уровня handoff.\n\nВыход: макеты + комментарии.",
  },
  {
    template_task_key: "responsive",
    title: "Адаптивы (если нужно)",
    description:
      "Подготовить адаптивные состояния/брейкпоинты.\n\nВыход: набор адаптивов + правила.",
  },
  {
    template_task_key: "handoff",
    title: "Handoff: спецификация + экспорт",
    description:
      "Подготовить спецификацию, экспорт ассетов, описать взаимодействия.\n\nВыход: handoff-ready пакет.",
  },
  {
    template_task_key: "final_qc",
    title: "Финальная проверка и передача",
    description:
      "Проверить консистентность, доступность, логические связи.\n\nВыход: sign-off и передача.",
  },
];
