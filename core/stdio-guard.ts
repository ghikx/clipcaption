// En MCP (stdio), stdout transporte le protocole : tout log (Remotion, whisper…) qui y
// serait écrit corromprait la connexion. Ce module, importé en premier, redirige les
// logs vers stderr.
console.log = console.error;
console.info = console.error;
console.warn = console.error;
console.debug = console.error;
