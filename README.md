# Interview Guide

Редакция 4: 540 материалов для фронтенд-интервью — 480 технических вопросов и 60 практических задач. В каждой из девяти тем на каждой из четырёх вкладок по 15 карточек.

**Сайт:** https://pigalovmaxim.github.io/interview-guide/

## Локальный запуск

Откройте `web/index.html` в современном браузере. Установка зависимостей и сборка не требуются: сайт написан на HTML, CSS и JavaScript, оценки сохраняются в `localStorage` браузера.

Подробности устройства и поведения сайта — в [web/README.md](web/README.md). Спецификации проекта находятся в `_bmad-output/`.

В банке 45 вопросов из публичной выборки EasyOffer, 40 из подборки YauhenKavalchuk/interview-questions и 395 редакционных технических кейсов проекта. У сторонних вопросов сохранены формулировки, уровни и ссылки. Все 60 практических задач сохранены.

На каждой вкладке 135 материалов. Стартовая тема — JavaScript. Оценки опубликованных карточек продолжают храниться в `interview-guide.ratings.v3`; архивы прежних редакций и оформление сохраняются.

Проверки: `node --test tests/*.test.js` и `node tests/browser-check.cjs` (внешний Playwright и Chromium/Edge). Снимки источников и редакционные исходники находятся в `data-sources/`; `node data-sources/build-bank.cjs` пересобирает тематический банк, не меняя `coding.js`.

## Публикация

Исходники проекта хранятся в ветке `main`, опубликованная версия сайта — в корне ветки `gh-pages`. Чтобы отправить изменения и обновить сайт, выполните из корня проекта:

```sh
git add web data-sources tests README.md
git commit -m "Update website"
git push origin main
git subtree push --prefix web origin gh-pages
```

В настройках репозитория **Settings → Pages → Source** выбран **Deploy from a branch**, ветка **gh-pages**, каталог **/ (root)**. После обновления ветки GitHub автоматически публикует сайт.
