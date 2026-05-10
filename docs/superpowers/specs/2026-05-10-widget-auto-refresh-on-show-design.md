# Widget auto-refresh on show — Design Spec

> Source de vérité validée pour la mini-update "auto-refresh à l'ouverture du widget". Issue de la session de brainstorming du 2026-05-10.
> Plan d'implémentation : à écrire après validation de cette spec.

## Contexte

L'app `AI Usage Monitor` (post M5) ouvre le widget popup via :
- Le raccourci global (par défaut `Ctrl+Shift+Alt+U`)
- Un clic sur l'icône tray
- L'item "Open Widget" du menu contextuel tray

Tous ces chemins convergent vers `toggleWidget(tray)` dans [electron/widget-window.js](../../../electron/widget-window.js). La fenêtre est créée une fois au premier appel puis simplement masquée/affichée au blur — elle n'est jamais détruite. Le composant React `Widget.jsx` ne fetch les données qu'**une seule fois au montage initial** ([src/widget/Widget.jsx:42](../../../src/widget/Widget.jsx)).

Conséquence : entre deux ouvertures, le widget peut afficher des valeurs vieilles de plusieurs minutes (jusqu'au prochain tick du poller background, cadence par défaut 5 min). Sur un gros projet où les limites grimpent vite, ça donne une fausse impression et contrevient au principe "ne jamais afficher de valeur stale silencieusement".

## Problème adressé

À chaque ouverture du widget (peu importe la source), les données affichées doivent être fraîches — l'utilisateur ne doit pas avoir à cliquer sur le bouton "↻ Rafraîchir" manuellement.

## Scope

### Comportement

- **Trigger** : à chaque transition `hidden → visible` du widget (raccourci, clic tray, menu contextuel — toutes les sources passent par `toggleWidget`).
- **Action** : déclencher `refreshAll()` côté renderer (même chemin que le bouton ↻ existant).
- **Throttle** : si le dernier refresh date de moins de **10 secondes**, skip. Évite le spam si l'utilisateur ouvre/ferme rapidement et limite le risque de rate-limit / Cloudflare challenge sur les endpoints providers.
- **Feedback visuel** : aucun ajout — l'état `refreshing` existant (bouton ↻ désactivé pendant le fetch) suffit.

### Architecture

Pattern IPC unidirectionnel main → renderer, identique à `app:navigateTo` qui existe déjà.

1. **Main process** ([electron/widget-window.js](../../../electron/widget-window.js)) — dans `toggleWidget`, après `w.show()` / `w.focus()`, ajouter `w.webContents.send('widget:onShow')`.
2. **Preload** ([electron/preload.js](../../../electron/preload.js)) — exposer `window.api.widget.onShow(cb)` qui retourne une fonction d'unsubscribe (mirror exact de `app.onNavigateTo`).
3. **Renderer** ([src/widget/Widget.jsx](../../../src/widget/Widget.jsx)) :
   - Ajouter `lastFetchRef = useRef(0)`, mis à jour dans `refresh` après le fetch (en plus de `setLastFetch`, qui reste utilisé pour le rendu "Mis à jour il y a Xs").
   - Ajouter un `useEffect` qui s'abonne à `window.api.widget.onShow`, et déclenche `refresh()` si `Date.now() - lastFetchRef.current >= 10_000`.

### Cas particulier — premier show

Au tout premier appel à `toggleWidget`, `createWidgetWindow()` instancie la fenêtre et charge l'URL. L'IPC `widget:onShow` est envoyé tout de suite après `show()`, mais le renderer peut ne pas avoir fini son montage. Pas un problème :
- Le `useEffect` de refresh initial existant ([Widget.jsx:42](../../../src/widget/Widget.jsx)) déclenche déjà un fetch au mount.
- Si l'IPC `onShow` arrive avant le mount, il est perdu (pas de listener attaché) — mais le mount-refresh couvre déjà le cas.
- Si l'IPC arrive après le mount mais avant que `lastFetchRef` soit mis à jour, le throttle compare contre `0` (valeur initiale) → 10s écoulés → second refresh déclenché. Pour éviter ce doublon, on initialise `lastFetchRef` à `Date.now()` au mount (au moment où le mount-refresh est lancé), pas à `0`.

### Hors scope

- Distinguer la source d'ouverture (raccourci vs tray vs menu) — comportement uniforme sur tous les chemins.
- Préférence configurable pour le seuil de throttle — codé en dur à 10s.
- Loading skeleton ou indicateur dédié pour le refresh-on-show — l'état `refreshing` existant suffit.
- Refresh quand le widget reprend le focus sans transition hidden → visible (pas applicable, le widget se cache au blur).

## Tests

- **Renderer (Vitest)** : test unitaire sur `Widget.jsx` qui mock `window.api.widget.onShow` et `window.api.providers.refreshAll`, simule deux invocations de `onShow` (espacées de < 10s puis > 10s), et vérifie que `refreshAll` est appelé exactement deux fois (mount + second `onShow`), pas trois.
- **Main (Vitest)** : si la suite test couvre déjà `widget-window.js`, ajouter un test que `webContents.send('widget:onShow')` est appelé après `show()` lors d'une transition hidden→visible et **pas** lors d'une transition visible→hidden. Sinon, couverture e2e manuelle.
- **Manuel** : ouvrir le widget via raccourci → vérifier que `Mis à jour il y a Xs` repasse à 0s. Fermer (Esc / blur), rouvrir < 10s plus tard → pas de nouveau fetch. Attendre 15s, rouvrir → nouveau fetch.

## Fichiers touchés

- `electron/widget-window.js` — 1 ligne ajoutée dans `toggleWidget`
- `electron/preload.js` — ajout de `widget.onShow` (mirror de `app.onNavigateTo`)
- `src/widget/Widget.jsx` — `useRef` + `useEffect` d'abonnement, init de `lastFetchRef` au mount
- `tests/` — un nouveau test unitaire renderer (cf. section Tests)
