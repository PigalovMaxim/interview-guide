# Interview Guide

Банк из 540 вопросов и задач для проведения фронтенд-интервью: девять тем, четыре уровня, оценки ответов и экран итогов.

**Сайт:** https://pigalovmaxim.github.io/interview-guide/

## Локальный запуск

Откройте `web/index.html` в современном браузере. Установка зависимостей и сборка не требуются: сайт написан на HTML, CSS и JavaScript, оценки сохраняются в `localStorage` браузера.

Подробности устройства и поведения сайта — в [web/README.md](web/README.md). Спецификации проекта находятся в `_bmad-output/`.

## Публикация

Исходники проекта хранятся в ветке `main`, опубликованная версия сайта — в корне ветки `gh-pages`. Чтобы отправить изменения и обновить сайт, выполните из корня проекта:

```sh
git add web
git commit -m "Update website"
git push origin main
git subtree push --prefix web origin gh-pages
```

В настройках репозитория **Settings → Pages → Source** выбран **Deploy from a branch**, ветка **gh-pages**, каталог **/ (root)**. После обновления ветки GitHub автоматически публикует сайт.
