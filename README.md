# GR_Controle Web

Esta pasta contém uma versão estática do app `GR_Controle` pronta para ser publicada na web.

## Arquivos necessários

- `index.html`
- `styles.css`
- `app.js`

> Mantenha os 3 arquivos juntos na mesma pasta.

## Como publicar na web

### 1. GitHub Pages

1. Crie um repositório público no GitHub.
2. Copie os arquivos desta pasta para o repositório.
3. No GitHub, ative o GitHub Pages em `Settings > Pages` e selecione o branch `main` ou `master`.
4. O link será algo como:
   - `https://<seu-usuario>.github.io/<nome-do-repositorio>/`

### 2. Netlify (arrastar e soltar)

1. Acesse `https://app.netlify.com/drop`.
2. Arraste esta pasta com os arquivos para a área de upload.
3. O Netlify criará um link web público automaticamente.

### 3. Vercel

1. Acesse `https://vercel.com/new`
2. Selecione a opção de importar de um repositório Git ou arraste a pasta.
3. Publique o site e use o domínio gerado.

## Uso no celular e no PC

- Depois de hospedado, abra o link no navegador do celular ou do PC.
- Funciona em Chrome, Firefox, Safari e Edge.
- Não é necessário app especial.

## Dica de teste local

Se quiser testar localmente no PC antes de publicar, use um servidor estático:

- com Python 3:

  ```bash
  python -m http.server 8000
  ```

- então abra `http://localhost:8000` no navegador.

## Observações

- O app depende de internet para carregar `Chart.js`, `LZ-String` e `QRious` via CDN.
- Para ser usado por outras pessoas como link, o site precisa estar hospedado na web.
