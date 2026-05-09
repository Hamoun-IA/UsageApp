# AI Usage Monitor

Une jauge de tes abonnements IA dans la barre des tâches Windows.
Installe, connecte tes comptes, tu sais en permanence où tu en es.

---

## C'est quoi le problème ?

Si tu paies plusieurs abonnements IA en parallèle — Claude Pro, ChatGPT Plus,
Ollama Cloud, Z.ai... — chacun a ses propres limites :

- **Claude Pro/Max** : un quota par session de 5h + un quota hebdomadaire
- **ChatGPT Plus (avec Codex)** : limite hebdomadaire sur GPT-5 Codex
- **Ollama Cloud Pro** : crédits mensuels
- **Z.ai Coding Plan** : tokens session + tokens hebdomadaires

Et **aucun** de ces services ne te dit clairement
*« t'es à 73 % de ton quota cette semaine, ça reset dans 3 jours »*.

Du coup tu te retrouves dans l'une de ces situations :

- 🛑 **Bloqué en pleine session** parce qu'un quota a sauté sans prévenir
- 😔 **Sous-utilisé** parce que t'oses pas, par peur de tomber à sec
- 💸 **À payer pour rien** parce que tu n'as pas la visibilité de ce que tu consommes

## La solution

Un mini-widget dans la barre système Windows qui regroupe les 4 services en un seul
endroit.

- **Clic gauche sur l'icône tray** → un popup montre 4 lignes (une par provider) avec
  les barres « session » et « weekly » remplies en temps réel.
- **Double-clic ou clic droit → Open Detail Window** → une fenêtre détaillée avec
  graphiques 30 jours, alertes configurables, paramètres.
- **Connexion une seule fois** par provider (l'app ouvre un mini-navigateur, tu te
  logges normalement avec ton compte, l'app capture la session sécurisée).
- **Refresh automatique** en arrière-plan (toutes les 5 min par défaut, configurable).
- **Notifications Windows natives** quand tu approches d'une limite (seuil
  configurable par provider).
- **Icône tray devient rouge** quand un quota dépasse ton seuil critique.

C'est pensé pour rester discret : ça vit dans le tray, ça consomme presque rien (~50 MB
RAM, lecture HTTP toutes les X minutes), et tu peux fermer la fenêtre détaillée sans
que l'app s'arrête.

## Captures d'écran

_(à venir)_

## Installation rapide (utilisateur final)

1. Va sur la page **[Releases](https://github.com/Hamoun-IA/UsageApp/releases)**.
2. Télécharge selon ta préférence :
   - `AI Usage Monitor Setup 0.1.0.exe` — **installer classique** : entrée Démarrer,
     désinstallation propre via le panneau de configuration. Recommandé.
   - `AI Usage Monitor 0.1.0.exe` — **portable** : pas d'installation, tu lances
     directement depuis n'importe où (clé USB, dossier perso). Pratique pour tester.
3. Lance le `.exe`.

L'app n'a pas de signature de code (pas d'éditeur officiel chez Microsoft), donc
Windows SmartScreen va probablement t'afficher un avertissement
*« Microsoft Defender SmartScreen a empêché l'exécution »*.
Clique sur **Informations complémentaires** puis **Exécuter quand même**.
C'est normal pour les apps perso non-signées.

Au premier lancement :
- Une **icône orange en forme de jauge** apparaît en bas à droite de Windows (zone de
  notification, à côté de l'horloge).
- **Clic gauche dessus** → popup widget. Tu vois 4 lignes "Connecter".

## Connecter chaque provider

Chacun nécessite une connexion une fois, puis l'app garde ta session chiffrée
localement.

### Claude Pro/Max
1. Clique **Connecter** sur la ligne Claude.
2. Une fenêtre de connexion `claude.ai` s'ouvre. Logge-toi normalement.
3. La fenêtre se ferme automatiquement quand l'auth est captée.
4. Le widget affiche maintenant ta session 5h + ta jauge weekly.

### ChatGPT Plus (Codex)
1. Clique **Connecter** sur la ligne Codex.
2. Logge-toi sur `chatgpt.com` dans la fenêtre qui s'ouvre.
3. ⚠ Cette source utilise aussi en partie tes fichiers locaux dans
   `~/.codex/sessions/*.jsonl` (pour la session courante).
   Si tu n'utilises pas le CLI Codex, seule la partie weekly sera tracée.

### Ollama Cloud Pro
1. Clique **Connecter** sur la ligne Ollama.
2. Logge-toi sur `ollama.com`.

### Z.ai Coding Plan
1. Clique **Connecter** sur la ligne Z.ai.
2. Logge-toi sur `z.ai`.

## Utilisation au quotidien

- **Ouvrir le widget rapidement** : `Ctrl + Shift + Alt + U` (configurable dans
  Settings).
- **Voir l'historique 30 jours** : double-clic sur le tray ou clic droit → Open Detail
  Window → onglet History.
- **Voir les seuils d'alerte et le journal** : Open Detail Window → onglet Alerts.
- **Configurer la cadence du refresh** : Open Detail Window → Settings → Fréquence
  (1 / 5 / 15 minutes).
- **Démarrer avec Windows** : Open Detail Window → Settings → coche « Lancer au
  démarrage ».
- **Quitter complètement** : clic droit tray → Quit (sinon clic sur la croix de la
  fenêtre détaillée la cache mais l'app continue de tourner en background).

## Configuration utile

Tout est dans **Settings** (clic droit tray → Open Detail Window → Settings) :

| Section | Quoi |
|---|---|
| **Connexions** | Connecter / déconnecter chaque provider |
| **Démarrage automatique** | Lancer l'app au démarrage Windows en mode tray-only |
| **Fréquence de rafraîchissement** | 1 / 5 / 15 minutes (défaut 5) |
| **Raccourci global** | Combinaison clavier qui ouvre/ferme le widget popup |
| **Rétention DB** | Combien de temps garder l'historique : 7 / 30 / 90 / 180 jours |

Et dans **Alerts** (à côté de Settings) :
- Pour chaque provider : seuil session (%) + seuil weekly (%) + seuil erreur (heures).
- Liste des alertes des 7 derniers jours.

## C'est sécurisé ?

Oui :

- **Tes secrets d'auth** (cookies, JWT) sont chiffrés avec **DPAPI** Windows. C'est
  exactement le même chiffrement que celui qu'utilisent Edge ou Chrome pour stocker tes
  mots de passe : seul ton compte Windows peut les déchiffrer.
- **Aucun appel sortant** vers autre chose que les 4 providers que tu as explicitement
  connectés. Pas de télémétrie, pas d'analytics, pas de tracker.
- **Code 100 % open source** sous licence MIT. Tu peux auditer ce que fait chaque
  module : tout le code des appels HTTP est dans `electron/providers/*.js`.
- L'app **ne stocke aucun mot de passe** — juste les cookies de session post-login (tu
  les invalides toujours en te déconnectant côté provider).

## Désinstallation

- Si tu as utilisé l'**installer NSIS** : Panneau de configuration → Programmes →
  désinstaller.
- Si tu as utilisé le **portable** : supprime le fichier .exe + le dossier
  `%APPDATA%\AI Usage Monitor\` (qui contient ta DB locale et tes secrets chiffrés).

## Pour les développeurs

Si tu veux contribuer ou builder toi-même, l'état complet du projet — conventions,
pièges connus, roadmap, comment reprendre — est documenté dans
[`docs/superpowers/HANDOFF.md`](docs/superpowers/HANDOFF.md).

Quick start dev :

```
git clone https://github.com/Hamoun-IA/UsageApp
cd UsageApp
npm install
npm run dev
```

Tests :

```
npm test          # 264 tests Vitest + happy-dom
```

Build distribuable :

```
npm run dist      # → release/AI Usage Monitor Setup 0.1.0.exe + portable
```

⚠ **Gotcha `better-sqlite3`** : le module a un binaire natif compilé contre une ABI
spécifique. Le post-install d'electron-builder le compile pour Electron, mais
Vitest tourne sous Node — donc avant `npm test`, faire un rebuild manuel :

```
cd node_modules/better-sqlite3 && npm run build-release && cd ../..
```

Inversement, avant `npm run dev` ou `npm run dist`, refaire `npm run rebuild` pour
revenir à l'ABI Electron.

## Architecture

L'app est un **Electron** monolithe :

- **Main process** (`electron/`) — Node.js : tray, fenêtres, providers, DB SQLite,
  poller background, notifications natives.
- **Renderer process** (`src/`) — React 18 : UI du widget popup et de la fenêtre
  détaillée (Dashboard / History / Alerts / Settings).
- **DB** : `better-sqlite3` (SQLite local, ~30 KB pour 90 jours d'usage typique).
- **Build** : Vite pour le bundling React, electron-builder pour le packaging Windows
  (NSIS + portable).

## License

MIT.

## Crédits

Inspirée de [CodexBar](https://github.com/erans/codexbar).
Icône : [icon.kitchen](https://icon.kitchen).
Construit avec l'aide de [Claude Code](https://claude.com/claude-code).
