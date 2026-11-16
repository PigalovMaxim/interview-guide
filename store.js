/* Одно интервью. Ключи совместимы с уже сохранёнными оценками. */
(function () {
  'use strict';
  const ratingsKey = 'interview-guide.ratings';
  const themeKey = 'interview-guide.theme';
  const ids = new Set(window.InterviewContent.materials.map(item => item.id));
  const ratings = new Set(['no_answer', 'basic', 'confident', 'deep']);
  const listeners = new Set();
  const touched = new Set();
  const state = { ratingsById: {}, theme: 'dark', ratingsNotice: '', themeNotice: '' };
  let protectedData = false;
  let readFailed = false;
  const memoryMessage = 'Не удалось сохранить оценки. После перезагрузки они могут потеряться.';

  function restore(raw) {
    if (raw === null) return { values: {}, protected: false, notice: '' };
    try {
      const record = JSON.parse(raw);
      if (!record || record.schemaVersion !== 1 || !record.ratingsById || typeof record.ratingsById !== 'object' || Array.isArray(record.ratingsById)) throw new Error();
      const values = {};
      let skipped = false;
      for (const [id, rating] of Object.entries(record.ratingsById)) {
        if (ids.has(id) && ratings.has(rating)) values[id] = rating;
        else skipped = true;
      }
      return { values, protected: false, notice: skipped ? 'Оценки восстановлены частично: неизвестные вопросы и неверные значения пропущены.' : '' };
    } catch {
      return { values: {}, protected: true, notice: 'Сохранённые оценки повреждены или имеют неизвестную версию. Они не перезаписаны; новые отметки работают в памяти до явной очистки.' };
    }
  }
  try {
    const saved = restore(window.localStorage.getItem(ratingsKey));
    state.ratingsById = saved.values;
    state.ratingsNotice = saved.notice;
    protectedData = saved.protected;
  } catch { readFailed = true; state.ratingsNotice = memoryMessage; }
  try {
    const theme = window.localStorage.getItem(themeKey);
    if (theme === 'light' || theme === 'dark') state.theme = theme;
  } catch { state.themeNotice = 'Настройка оформления доступна только на этой странице.'; }

  function emit() { for (const listener of listeners) listener(state); }
  window.InterviewStore = {
    getState() { return state; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    rate(id, rating) {
      if (!ids.has(id) || (rating !== null && !ratings.has(rating))) return;
      if (rating === null) delete state.ratingsById[id];
      else state.ratingsById[id] = rating;
      if (!protectedData) {
        if (readFailed) touched.add(id);
        try {
          if (readFailed) {
            const saved = restore(window.localStorage.getItem(ratingsKey));
            if (saved.protected) {
              protectedData = true;
              state.ratingsNotice = saved.notice;
              emit();
              return;
            }
            for (const key of touched) delete saved.values[key];
            state.ratingsById = { ...saved.values, ...state.ratingsById };
            readFailed = false;
            touched.clear();
          }
          window.localStorage.setItem(ratingsKey, JSON.stringify({ schemaVersion: 1, ratingsById: state.ratingsById }));
          state.ratingsNotice = '';
        } catch { state.ratingsNotice = memoryMessage; }
      }
      emit();
    },
    setTheme(theme) {
      if (theme !== 'dark' && theme !== 'light') return;
      state.theme = theme;
      try { window.localStorage.setItem(themeKey, theme); state.themeNotice = ''; }
      catch { state.themeNotice = 'Оформление изменено, но его не удалось сохранить.'; }
      emit();
    },
    clear() {
      state.ratingsById = {};
      try {
        window.localStorage.removeItem(ratingsKey);
        protectedData = false;
        readFailed = false;
        touched.clear();
        state.ratingsNotice = 'Оценки текущего интервью очищены.';
      } catch {
        protectedData = true;
        state.ratingsNotice = 'Оценки на странице очищены, но сохранение удалить не удалось. Старые результаты могут вернуться после перезагрузки.';
      }
      emit();
    }
  };
}());
