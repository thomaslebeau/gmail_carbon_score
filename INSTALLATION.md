# 🚀 Guide d'installation rapide - Gmail Carbon Score

## Étape 1 : Configuration Google Cloud (5 minutes)

### 1.1 Créer un projet
1. Allez sur https://console.cloud.google.com/
2. Cliquez sur "Sélectionner un projet" en haut
3. Cliquez sur "Nouveau projet"
4. Nommez-le "Gmail Carbon Score"
5. Cliquez sur "Créer"

### 1.2 Activer l'API Gmail
1. Dans le menu (☰), allez dans **APIs & Services > Library**
2. Cherchez "Gmail API"
3. Cliquez dessus puis sur **"Activer"** (Enable)

### 1.3 Créer les identifiants OAuth
1. Dans le menu, allez dans **APIs & Services > Credentials**
2. Cliquez sur **"+ Créer des identifiants"** en haut
3. Sélectionnez **"ID client OAuth"**
4. Si demandé, configurez l'écran de consentement :
   - Type d'utilisateur : **Externe**
   - Remplissez les champs requis (nom de l'application, email)
   - Ajoutez les scopes : `https://www.googleapis.com/auth/gmail.readonly`
   - Ajoutez votre email comme utilisateur de test
5. Revenez à la création d'identifiants :
   - Type d'application : **Application Chrome**
   - Nom : "Gmail Carbon Score Extension"
   - ID de l'application : Obtenez-le après avoir chargé l'extension (voir étape 2)

### 1.4 Récupérer votre Client ID
Une fois créé, copiez votre **Client ID** (format : `xxxxx.apps.googleusercontent.com`)

---

## Étape 2 : Installation de l'extension (2 minutes)

### 2.1 Obtenir l'ID de l'extension
1. Ouvrez Chrome
2. Allez sur `chrome://extensions/`
3. Activez le **"Mode développeur"** en haut à droite
4. Cliquez sur **"Charger l'extension non empaquetée"**
5. Sélectionnez le dossier `gmail-carbon-extension`
6. **Copiez l'ID de l'extension** (longue chaîne de lettres sous le nom)

### 2.2 Ajouter l'ID dans Google Cloud
1. Retournez dans Google Cloud Console > Credentials
2. Si vous n'avez pas encore créé l'OAuth client :
   - Créez-en un nouveau en utilisant l'ID de l'extension
3. Si vous l'avez déjà créé :
   - Cliquez dessus pour l'éditer
   - Ajoutez l'ID de l'extension dans "ID de l'application"
   - Sauvegardez

### 2.3 Configurer le manifest.json
1. Ouvrez le fichier `manifest.json` dans un éditeur de texte
2. Trouvez la ligne `"client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com"`
3. Remplacez `YOUR_CLIENT_ID.apps.googleusercontent.com` par votre vrai Client ID
4. Sauvegardez le fichier
5. Retournez sur `chrome://extensions/`
6. Cliquez sur le bouton **"Recharger"** (🔄) de l'extension

---

## Étape 3 : Première utilisation (1 minute)

1. Ouvrez Gmail dans votre navigateur
2. Cliquez sur l'icône de l'extension dans la barre Chrome
3. Cliquez sur **"🔍 Analyser ma boîte mail"**
4. **Autorisez l'accès** à votre compte Gmail
5. Attendez la fin de l'analyse
6. Consultez vos résultats ! 🎉

---

## ⚠️ Problèmes fréquents

### "Error: OAuth2 not granted or revoked"
➡️ Vérifiez que :
- Le Client ID est correctement configuré dans `manifest.json`
- L'ID de l'extension correspond à celui dans Google Cloud
- Vous avez ajouté votre email comme utilisateur de test
- L'API Gmail est bien activée

### "La page ne répond pas"
➡️ L'analyse de beaucoup d'emails peut prendre du temps (1-2 minutes pour 1000 emails)

### Le widget n'apparaît pas dans Gmail
➡️ Actualisez la page Gmail (F5) après avoir installé l'extension

---

## 📝 Notes importantes

- **Utilisateurs de test** : En mode "Externe", vous devez ajouter les emails des utilisateurs qui testeront l'extension
- **Quotas API** : Gmail API a des limites (1 milliard de requêtes/jour, mais limité à quelques milliers pour les nouveaux projets)
- **Confidentialité** : L'extension lit uniquement les métadonnées (taille), pas le contenu des emails

---

## 🎯 C'est prêt !

Votre extension est maintenant fonctionnelle. Vous pouvez :
- Voir votre score carbone total
- Consulter le nombre d'emails analysés
- Comparer avec des équivalents (km en voiture, repas)
- Utiliser le widget dans Gmail

**Profitez-en pour prendre conscience de votre impact numérique !** 🌱
