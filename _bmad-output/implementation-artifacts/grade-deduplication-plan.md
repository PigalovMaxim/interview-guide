# План замен после аудита

Каждая строка: retiredId → upstream path:line (исходный грейд). Новые ID вида `curated:<topic>:<slug>`. Поля новой карточки совпадают с имеющимися: title/question/shortAnswer/explanation/assessment{basic,confident,deep}/followUps[support,transfer]/context/references/verifiedAt/topic/tab/targetLevel/angles/kind. Краткий ответ решает весь основной вопрос, оценки конкретны. Добавить source{provider:'YauhenKavalchuk/interview-questions', sourceId, url, level, retrievedAt, commit, path, line, originalQuestion, adapted:true}; для авторских кейсов без GitHub source использовать origin:'project-editorial' и первичную документацию. У каждой замены отдельное reason. Проверять первичные ссылки по сети, не утверждать неподтверждённую проверку. Отчёт и снимок проверки можно добавить отдельным файлом, старые verification не менять задним числом.

## JavaScript: 19 замен

- easyoffer:junior:13086 → questions/js.md:12 Junior, ==/===. Убираем второй Event Loop у Junior.
- easyoffer:middle:13086 → questions/js.md:70 Middle, каррирование vs partial application.
- easyoffer:middle:309 → questions/js.md:71 Middle, мемоизация: ключи/инвалидация.
- easyoffer:middle:14135 → questions/js.md:73 Middle, debounce/throttle: leading/trailing/cancel.
- easyoffer:middle:1255 → questions/js.md:75 Middle, прототипы и словарь без прототипа.
- easyoffer:middle:12253 → questions/js.md:78 Middle, Object/Map: идентичность ключа.
- easyoffer:middle:1415 → questions/es.md:46 Middle, structuredClone: циклы и transfer.
- easyoffer:middle:12863 → questions/js.md:94 Middle, Error subclass/cause.
- easyoffer:middle:14124 → questions/browser-js.md:27 Middle, отражение boolean attribute/property и произвольные JS properties vs строковые атрибуты. Не использовать value/default/reset — этот механизм уже проверяет HTML selected-default.
- easyoffer:senior:13086 → questions/js.md:105 Senior, execution context: environment/receiver/module.
- easyoffer:senior:1255 → questions/js.md:106 Senior, heap-retention/утечки и доказательство исправления.
- easyoffer:senior:14135 → questions/js.md:109 Senior, SharedArrayBuffer/Atomics и гонки.
- easyoffer:senior:12863 → questions/es.md:53 Senior, sync generators и return/finally cleanup (не async iterator).
- easyoffer:senior:309 → questions/es.md:56 Senior, well-known symbols на Symbol.toPrimitive (не Array.from iteration).
- easyoffer:senior:12253 → questions/async-js.md:42 Senior, scheduler API, yield/priority/cancellation/fallback.
- easyoffer:senior:1415 → questions/browser-js.md:46 Senior, Shadow DOM, composed/retargeting.
- easyoffer:senior:14124 → questions/browser-js.md:48 Senior, compositor/main thread, диагностика анимаций.
- easyoffer:senior:24627 → questions/browser-js.md:45 Senior, feature detection/inference/UA.
- easyoffer:senior:925 → questions/web.md:66 Senior, service workers: update/lifecycle/cache-version consistency.

## TypeScript: 5 замен

- easyoffer:middle:8049 → questions/ts.md:41 Middle, d.ts runtime vs declarations.
- easyoffer:middle:24393 → questions/ts.md:44 Middle, template literal types: конечный связанный API, не взрыв checker.
- project:typescript:spread-overwrite → questions/ts.md:42 Middle, satisfies: проверка конфигурации без потери inference (не advanced empty-map).
- easyoffer:senior:8049 → questions/ts.md:54 Senior, infer на структурном извлечении с union/overload constraints (не distributive conditional).
- project:typescript:template-explosion → questions/ts.md:52 Senior, миксины: копирование descriptor не инициализирует поля/private brands; advanced targetSenior nuance.

## HTML/CSS/React: 11 замен

- easyoffer:junior:29648 → questions/react.md:24 Junior, Rules of Hooks.
- easyoffer:middle:12629 → questions/react.md:47 Middle, useReducer: согласованный переход состояния.
- easyoffer:senior:12629 → questions/react.md:87 Senior, server components: выполнение/границы/данные.
- easyoffer:senior:12873 → questions/react.md:90 Senior, React Compiler: условия/миграция/проверка.
- project:react:usememo-resource → questions/react.md:86 Senior, use(): suspension/rejection и placement exceptions. advanced targetSenior nuance.
- project:react:key-scope → questions/react.md:82 Senior, ReactDOMServer: runtime/stream APIs, не повтор hydration. advanced targetSenior engineering.
- project:react:modal-focus → questions/react.md:93 Senior, Server Actions: серверные команды/авторизация/формы.
- project:css:contain-size → questions/css.md:84 Senior, Houdini: typed props/paint worklet, не повтор inherits:false. advanced targetSenior nuance.
- project:html:rtl-shell → questions/html.md:86 Senior, popover: nonmodal/top-layer/light-dismiss/auto-manual.
- project:css:css-budget → questions/css.md:81 Senior, @scope root/limit/proximity/migration.
- project:css:user-spacing → questions/css.md:85 Senior, anchor positioning/fallback/overflow.

## Архитектура: 3 замены

- project:architecture-fsd:dependency-budget → questions/architecture.md:34 Senior, CQRS: eventual read model, read-your-writes.
- project:architecture-fsd:critical-path → questions/architecture.md:33 Senior, EDA: delivery/order/idempotency и проверка отказа.
- kavalchuk:architecture-fsd:27406354d200 → questions/architecture.md:30 Senior, DDD bounded contexts/ownership/контекстные модели.

## Redux: 7 замен (авторские кейсы по официальной документации)

Сначала прочитать все 60 оставшихся Redux карточек, чтобы не повторить их механизмы.

- project:redux:immer-mutate-return (advanced) → combineSlices lazy injection: selector proxy/default state vs реальное materialized state до action.
- project:redux:rtkq-no-subscribe (advanced) → RTKQ default serializeQueryArgs: один объект аргументов мутировали на месте, weak-map serialization cache; immutable args/контракт идентичности. Сверить с текущей реализацией.
- project:redux:redux-reducer-dispatch (advanced) → RTKQ delayed invalidation: pending requests не дают сбросить tags; отличие immediately, политика для постоянно активного polling.
- project:redux:hot-module-state (senior) → Redux SSR: per-request store, безопасная сериализация initial state и hydration, персональные данные двух запросов.
- project:redux:domain-adapter (senior) → optimistic RTK Query detail/list caches: граница document-cache vs normalized cross-endpoint graph, авторитет/consistency без повторения rollback race.
- project:redux:selector-budget (senior) → autoBatchEnhancer: reducer/getState синхронны, уведомления отложены; очереди и наблюдатели, атомарность не выводится из batching. Отличать от cross-slice-atomic.
- project:redux:store-boundary-test (senior) → RTKQ streaming initial-load race: cacheDataLoaded/updateCachedData, sequence/replay/resync; не повторять socket-gap алгоритм, фокус handoff snapshot→stream.

## TanStack Query: 6 замен (авторские кейсы по v5 docs)

Сначала прочитать все 60 оставшихся карточек, чтобы не повторить механизмы.

- project:tanstack-query:query-meta (advanced) → tracked observer properties: чтение status/data vs object rest destructuring, notifyOnChangeProps. Не повторять select-observer (место преобразования) или select-cost (стоимость функции).
- project:tanstack-query:refetch-params (advanced) → default hashKey: undefined в объекте vs в массиве/null, порядок ключей объекта vs элементов массива. Проверить реализацию и ограничения JSON-сериализуемых ключей; не повторять простую нормализацию string/number.
- project:tanstack-query:route-loader (senior) → dependent waterfalls: latency critical path, backend flattening/prefetch, серверная композиция, измерение.
- project:tanstack-query:test-isolation (senior) → networkMode online/always/offlineFirst для приложения с Service Worker cache, paused vs error/loading и восстановление подключения. Не повторять доменную авторитетность offline-authority, retry-storm или mutation-scope.
- project:tanstack-query:schema-validation (senior) → persisted offline mutations: default mutationFn для resume после reload, отсутствие closures, проверка доменной актуальности/идемпотентности.
- project:tanstack-query:draft-reconcile (senior) → streaming pending queries в SSR: prefetch без await, default dehydrate excludes pending, shouldDehydrateQuery + поддерживающая сериализация framework/Promise/error boundary, v5.40+. Удаляется межтематический дубль React senior draft-conflict: тот же overwrite/refetch→dirty draft/base revision/merge. Новый вопрос проверяет именно доставку незавершённых queries через hydration boundary, а не общий выбор React DOM stream API.

## Сохранённые пересечения

Picture/srcset, date-step/number-step, form submit/manual validation, layers/revert-layer, covariance/method bivariance, Array.from/iterator vs sync generator cleanup проверяют разные механизмы. Технические задачи (60) не дублируются по контракту, сохраняются. Сходные предметные области не равны дублям: определяющий критерий — одинаковое действие и ожидаемое рассуждение. Проверить остальные карточки при реализации: если выявлен новый явный дубль вне плана, сообщить ведущему агенту до изменения количества замен.
