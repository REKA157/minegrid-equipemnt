# TEST_COMMANDS.md

Adapter les commandes au projet réel.

## Frontend JavaScript / TypeScript

```bash
npm install
npm run lint
npm run test
npm run build
```

## Backend Python / FastAPI

```bash
pip install -r requirements.txt
pytest
python -m compileall .
```

## Backend Node.js

```bash
npm install
npm run lint
npm run test
npm run build
```

## Validation manuelle UI

Pour une modification UI, fournir :

- page testée ;
- navigateur ;
- capture écran si possible ;
- comportement attendu ;
- comportement obtenu.

## Règle

Une PR agent sans information de test est considérée incomplète.
