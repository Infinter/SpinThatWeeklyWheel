// Stub Vitest pour le paquet `server-only`.
// Le vrai `server-only` jette à l'import hors d'un graphe React Server (pas de condition
// d'export `react-server` sous Vitest). On l'alias ici (config Vitest UNIQUEMENT) pour pouvoir
// importer les Route Handlers dans les tests. Le `npm run build` réel utilise le vrai paquet
// → la garde AD-10 (échec build si import client) reste pleinement active en production.
export {}
