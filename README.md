# 🌱 Gmail Carbon Score - Extension Chrome

Une extension Chrome qui calcule l'empreinte carbone de votre boîte Gmail en analysant vos emails.

## 📊 Fonctionnalités

- ✅ Analyse automatique de votre boîte mail Gmail
- 📈 Calcul de l'empreinte carbone totale en kg de CO₂
- 📧 Distinction entre emails simples et emails avec pièces jointes
- 🎨 Interface moderne et intuitive
- 💡 Comparaisons pour mettre en perspective (km en voiture, repas)
- 🔄 Widget flottant dans Gmail pour suivre votre score

## 📐 Méthodologie de calcul

Les calculs sont basés sur les données officielles de l'ADEME (Agence de l'environnement et de la maîtrise de l'énergie) :

- **Email simple** : 4 grammes de CO₂
- **Email avec pièce jointe** : 35 grammes de CO₂

L'extension considère qu'un email a une pièce jointe significative s'il dépasse 100 KB.

## 🚀 Installation

### Prérequis

1. Vous devez avoir un compte Google et accéder à Gmail
2. Vous devez créer un projet dans Google Cloud Console

### Étape 1 : Configuration Google Cloud

1. Allez sur [Google Cloud Console](https://console.cloud.google.com/)
2. Créez un nouveau projet
3. Activez l'API Gmail :
   - Dans le menu, allez dans "APIs & Services" > "Library"
   - Cherchez "Gmail API" et cliquez sur "Enable"
4. Créez des identifiants OAuth 2.0 :
   - Allez dans "APIs & Services" > "Credentials"
   - Cliquez sur "Create Credentials" > "OAuth client ID"
   - Choisissez "Chrome extension"
   - Notez votre Client ID

### Étape 2 : Configuration de l'extension

1. Ouvrez le fichier `manifest.json`
2. Remplacez `YOUR_CLIENT_ID.apps.googleusercontent.com` par votre vrai Client ID
3. Créez les icônes (ou utilisez les icônes fournies)

### Étape 3 : Build du projet

1. Installez les dépendances : `npm install`
2. Compilez le projet : `npm run build`
3. Le dossier `dist/` contient maintenant l'extension compilée

### Étape 4 : Installation dans Chrome

1. Ouvrez Chrome et allez sur `chrome://extensions/`
2. Activez le "Mode développeur" (en haut à droite)
3. Cliquez sur "Charger l'extension non empaquetée"
4. Sélectionnez le dossier `dist/`
5. L'extension est maintenant installée !

## 📱 Utilisation

### Via le popup de l'extension

1. Cliquez sur l'icône de l'extension dans votre barre Chrome
2. Cliquez sur "🔍 Analyser ma boîte mail"
3. Autorisez l'accès à votre compte Gmail si demandé
4. Attendez que l'analyse se termine
5. Consultez vos résultats !

### Via le widget dans Gmail

1. Ouvrez Gmail dans votre navigateur
2. Un widget apparaît en bas à droite de la page
3. Le score s'affiche automatiquement s'il a déjà été calculé
4. Sinon, cliquez sur l'extension pour lancer une analyse

## 📈 Que signifient les résultats ?

### Empreinte Carbone Totale
Le nombre total de kg de CO₂ émis par l'ensemble de vos emails

### Emails analysés
Le nombre total d'emails présents dans votre boîte mail

### g CO₂ par email
L'empreinte carbone moyenne par email

### Comparaisons
- **km en voiture** : basé sur 210g CO₂/km (voiture moyenne)
- **repas** : basé sur 2kg CO₂/repas (repas moyen)

## 🔒 Confidentialité

- L'extension n'accède qu'aux métadonnées de vos emails (taille, nombre)
- Aucun contenu d'email n'est lu ou stocké
- Les calculs sont effectués localement dans votre navigateur
- Aucune donnée n'est envoyée à des serveurs externes

## ⚙️ Limitations

- L'analyse est limitée aux derniers 1000 emails pour des raisons de performance
- Les quotas de l'API Gmail peuvent limiter le nombre d'analyses par jour
- L'incertitude des calculs est d'environ 100% selon l'ADEME

## 🛠️ Technologies utilisées

- Chrome Extension API (Manifest V3)
- Gmail API v1
- TypeScript
- CSS moderne avec gradients et animations

## 📝 Structure du projet

```
gmail-carbon-score/
├── src/                  # Code source TypeScript
│   ├── background.ts     # Service Worker (logique principale)
│   ├── popup.ts          # Script du popup
│   └── content.ts        # Script injecté dans Gmail
├── dist/                 # Fichiers compilés (généré par le build)
├── manifest.json         # Configuration de l'extension
├── popup.html            # Interface du popup
├── styles.css            # Styles pour le widget Gmail
├── icons/                # Icônes de l'extension
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── package.json          # Dépendances et scripts de build
├── tsconfig.json         # Configuration TypeScript
├── build.sh              # Script de build
└── README.md             # Ce fichier
```

## 👨‍💻 Développement

### Prérequis

- Node.js (version 16 ou supérieure)
- npm

### Installation des dépendances

```bash
npm install
```

### Build du projet

Pour compiler le TypeScript et créer le fichier zip :

```bash
npm run build
```

Ou utilisez le script de build :

```bash
./build.sh
```

Cette commande va :
1. Nettoyer le dossier `dist/`
2. Compiler les fichiers TypeScript vers JavaScript
3. Copier les fichiers statiques (manifest, HTML, CSS, icônes)
4. Créer un fichier zip `gmail-carbon-score.zip` prêt à être distribué

### Mode développement

Pour compiler automatiquement lors des modifications :

```bash
npm run watch
```

### Commandes disponibles

- `npm run build` - Build complet (clean + compile + copy + zip)
- `npm run clean` - Nettoie le dossier dist
- `npm run compile` - Compile TypeScript vers JavaScript
- `npm run copy` - Copie les fichiers statiques
- `npm run zip` - Crée l'archive zip
- `npm run watch` - Compilation automatique des changements

## 🐛 Problèmes connus

- L'API Gmail a des quotas qui peuvent limiter les analyses fréquentes
- Gmail peut prendre du temps à charger, affectant l'apparition du widget
- Certaines pièces jointes très petites peuvent ne pas être comptées

## 🚀 Améliorations futures

- Analyse par période (dernière semaine, mois, année)
- Graphiques d'évolution temporelle
- Suggestions personnalisées pour réduire l'empreinte
- Export des données en CSV
- Comparaison avec d'autres utilisateurs (anonymisé)
- Détection des emails "lourds" à supprimer

## 📚 Sources

- [ADEME - Impact environnemental du numérique](https://www.ademe.fr/)
- [Gmail API Documentation](https://developers.google.com/gmail/api)
- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)

## 📄 Licence

Ce projet est sous licence MIT. Vous êtes libre de l'utiliser, le modifier et le distribuer.

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à :
- Signaler des bugs
- Proposer des nouvelles fonctionnalités
- Améliorer le code
- Corriger la documentation

## 💬 Questions ?

Si vous avez des questions ou des suggestions, n'hésitez pas à ouvrir une issue sur GitHub.

---

**Fait avec 💚 pour la planète**
