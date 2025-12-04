# Figma i18n to GitHub Plugin

A Figma plugin that extracts text from designs and syncs translations directly to GitHub.

## Features

- **Extract text** from selected Figma elements
- **Multi-language support** with side-by-side editing (EN, DE, FR, etc.)
- **Search existing keys** across all languages
- **Push to GitHub** with automatic YAML merging
- **Persistent settings** stored in Figma

## Installation

### Development

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the plugin:
   ```bash
   npm run build
   ```
4. In Figma, go to **Plugins → Development → Import plugin from manifest**
5. Select the `manifest.json` file from this directory

### Watch mode

For development with auto-rebuild:
```bash
npm run watch
```

## Usage

### Setup

1. Open the plugin in Figma
2. Click **"GitHub Settings"**
3. Configure:
   - **Personal Access Token**: GitHub PAT with `repo` scope ([create one](https://github.com/settings/tokens))
   - **Repository**: `owner/repo` (e.g., `myorg/i18n`)
   - **Branch**: `main`
   - **Translations folder**: `src`
   - **Filename**: `translations.yaml`
   - **Locales**: `en_US,de_DE,fr_FR`
4. Click **Save Settings**

### Workflow

#### Adding new translations

1. Select text elements in Figma
2. The plugin extracts text and suggests translation keys
3. Edit the key names as needed
4. Fill in translations for each language
5. Click **Push to GitHub**

#### Using existing keys

1. Click **Load existing keys** to fetch translations from GitHub
2. Type in the Key field to search across all keys and translations
3. Click a search result to assign that key and auto-fill translations
4. Edit if needed, then push

## File Structure

The plugin expects this GitHub repository structure:

```
your-repo/
└── src/
    ├── en_US/
    │   └── translations.yaml
    ├── de_DE/
    │   └── translations.yaml
    └── fr_FR/
        └── translations.yaml
```

### YAML Format

Flat key-value pairs:

```yaml
login.form.title: Login
login.form.field_password_placeholder: Password
login.form.error_auth_incorrect: The username or password is incorrect.
```

## GitHub Token Permissions

Create a Personal Access Token at https://github.com/settings/tokens

**Classic token:** Enable the `repo` scope

**Fine-grained token:**
- Repository access: Select your i18n repository
- Permissions:
  - Contents: Read and write
  - Metadata: Read

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Type check
npm run typecheck

# Watch mode (requires chokidar-cli)
npm install -g chokidar-cli
npm run watch
```

## Project Structure

```
figma-i18n-plugin/
├── manifest.json       # Figma plugin manifest
├── package.json
├── tsconfig.json
├── src/
│   ├── main.ts         # Plugin logic (Figma API, storage)
│   └── ui.html         # Plugin UI (settings, editor, GitHub API)
└── dist/
    ├── main.js         # Compiled plugin
    └── ui.html         # UI file
```

## License

ISC
