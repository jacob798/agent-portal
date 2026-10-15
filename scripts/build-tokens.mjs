import StyleDictionary from 'style-dictionary';
const dictionary = new StyleDictionary({
  source: ['design/tokens/*.json'],
  platforms: {
    css: { transformGroup: 'css', prefix: 'foundry', buildPath: 'design/generated/',
      files: [{ destination: 'tokens.css', format: 'css/variables', options: { showFileHeader: false } }] },
    json: { transformGroup: 'js', buildPath: 'design/generated/',
      files: [{ destination: 'tokens.json', format: 'json/flat' }] }
  }
});
await dictionary.buildAllPlatforms();
