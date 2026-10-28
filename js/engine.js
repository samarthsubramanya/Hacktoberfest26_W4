// Thin wrapper around wllama (llama.cpp compiled to WebAssembly).
// Everything here runs on the device: WebGPU when the browser has it, multi-threaded CPU otherwise.
import { Wllama, LoggerWithoutDebug } from '../vendor/wllama/index.js';

const HF = 'https://huggingface.co';

export const VESSELS = [
  {
    id: 'qwen2.5-0.5b',
    nick: 'The Medium',
    model: 'Qwen2.5 0.5B Instruct',
    quant: 'Q4_K_M',
    sizeMB: 398,
    license: 'Apache-2.0',
    note: 'Recommended. Clear voice, fits almost any phone.',
    url: `${HF}/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf`,
  },
  {
    id: 'smollm2-360m',
    nick: 'The Wisp',
    model: 'SmolLM2 360M Instruct',
    quant: 'Q4_K_M',
    sizeMB: 271,
    license: 'Apache-2.0',
    note: 'Lightest and fastest. A faint, rambling spirit.',
    url: `${HF}/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_K_M.gguf`,
  },
  {
    id: 'llama3.2-1b',
    nick: 'The Oracle',
    model: 'Llama 3.2 1B Instruct',
    quant: 'Q4_K_M',
    sizeMB: 808,
    license: 'Llama 3.2 Community',
    note: 'Most eloquent. Wants a newer phone (~2 GB free RAM).',
    url: `${HF}/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf`,
  },
];

const WASM = { default: new URL('../vendor/wllama/wasm/wllama.wasm', import.meta.url).href };
const LOAD_PARAMS = { n_ctx: 2048, n_batch: 256 };

export class Engine {
  constructor() {
    // allowOffline: when the weights are already cached, never touch the network.
    this.w = new Wllama(WASM, { allowOffline: true, logger: LoggerWithoutDebug, suppressNativeLog: true });
    this.label = null;
    this.backend = null;
  }

  get webgpu() {
    return this.w.isSupportWebGPU();
  }

  async cachedUrls() {
    try {
      const entries = await this.w.cacheManager.list();
      return new Set(entries.map((e) => e.metadata?.originalURL).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  async forget(url) {
    await this.w.cacheManager.delete(url);
  }

  // source: a VESSELS entry, or a File (bring-your-own GGUF)
  async load(source, { onProgress, signal } = {}) {
    if (this.w.isModelLoaded()) await this.w.exit();
    const attempt = async (extra) => {
      if (source instanceof File) {
        await this.w.loadModel([source], { ...LOAD_PARAMS, ...extra });
      } else {
        await this.w.loadModelFromUrl(source.url, {
          ...LOAD_PARAMS, ...extra,
          signal,
          progressCallback: ({ loaded, total }) => onProgress?.(loaded, total),
        });
      }
    };
    try {
      await attempt({});
      this.backend = this.webgpu ? 'WebGPU' : 'CPU';
    } catch (err) {
      if (signal?.aborted || !this.webgpu) throw err;
      // Some mobile GPUs advertise WebGPU but cannot run every kernel. Fall back to the CPU.
      console.warn('WebGPU load failed, retrying on CPU', err);
      if (this.w.isModelLoaded()) await this.w.exit();
      await attempt({ n_gpu_layers: 0 });
      this.backend = 'CPU';
    }
    this.label = source instanceof File ? source.name.replace(/\.gguf$/i, '') : source.model;
  }

  get loaded() {
    return this.w.isModelLoaded();
  }

  // Yields raw text deltas as the model produces them.
  async *speak(messages, { signal, maxTokens = 22 } = {}) {
    const stream = await this.w.createChatCompletion({
      messages,
      stream: true,
      max_tokens: maxTokens,
      temperature: 0.8,
      top_p: 0.9,
      top_k: 40,
      abortSignal: signal,
    });
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}
