---
title: Ouija Offline: a séance where the ghost lives on your phone
published: false
tags: devchallenge, hf26challenge, webgpu, llm
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 4: Ghost in the Machine](https://dev.to/challenges/hacktoberfest-week4-2026-10-26)*

## What I Built

**Ouija Offline** is a Ouija board you carry in your pocket. You ask a question, and a planchette slides across a candlelit wooden board, spelling out an answer one glowing letter at a time. The phone buzzes as it lands on each letter, and a low drone hums underneath.

The "spirit" is an open-weight language model running **entirely on your phone**, inside the browser. There's no server and no account. Once the model has downloaded, you can put the phone in airplane mode, turn off the lights, and the board still answers. That's the whole trick: the ghost really is *in the machine*.

You can call:

- 🕯️ **Eleanor Vance**, a governess who drowned in Blackwater Lake in 1893 and is still looking for the children
- 💾 **COBOL**, a programming language declared dead every decade since 1980 that still runs your bank (it has opinions about JavaScript)
- 🌊 **Ezra Holloway**, the lighthouse keeper whose lamp went dark the night the *Margaret Anne* hit the rocks
- 🌼 **Doña Catrina**, a Día de los Muertos visitor who follows the marigold petals home and mostly wants pan de muerto
- 🕊️ **Someone you remember**: type in a loved one's name and a few memories, and call them home for the night. It's a little digital ofrenda.

And because every Ouija board comes with one rule:

> **Always say goodbye.**

If you leave the board without saying goodbye, the next time you open the app *Something* is waiting at the top of the list. It won't let any other spirit through until you sit down with it and close the board properly. Shake your phone and the spirits notice. Stay silent too long and the planchette starts moving by itself.

## Demo

🔗 **Live:** https://samarthsubramanya.github.io/Hacktoberfest26_W4/ (open it on your phone, tap *Add to Home Screen*, download a vessel, then switch on airplane mode)

<!-- Add a screen recording here: the airplane-mode toggle followed by the planchette spelling an answer is the money shot. -->

| Choose a vessel | Someone you remember | Doña Catrina |
| --- | --- | --- |
| ![vessel](https://raw.githubusercontent.com/samarthsubramanya/Hacktoberfest26_W4/main/docs/vessel.png) | ![remember](https://raw.githubusercontent.com/samarthsubramanya/Hacktoberfest26_W4/main/docs/remember-seance.png) | ![catrina](https://raw.githubusercontent.com/samarthsubramanya/Hacktoberfest26_W4/main/docs/catrina-spelling.png) |

## Code

{% github samarthsubramanya/Hacktoberfest26_W4 %}

## How I Built It

**The engine is [wllama](https://github.com/ngxson/wllama) v3**, the WebAssembly build of **[llama.cpp](https://github.com/ggml-org/llama.cpp)**. That one open-source runtime does all the heavy lifting:

- It runs on **WebGPU** when the phone's browser supports it and falls back to **multi-threaded CPU** when it doesn't, so almost every phone can hold a séance. If a phone advertises WebGPU but its driver chokes, the app quietly retries on the CPU.
- It loads standard **GGUF** files, so swapping models is just changing a URL. I ship three "vessels":
  - **The Medium**: Qwen2.5 0.5B Instruct, Q4_K_M, 398 MB, Apache-2.0 (default)
  - **The Wisp**: SmolLM2 360M Instruct, 271 MB, for older phones
  - **The Oracle**: Llama 3.2 1B Instruct, 808 MB, the most eloquent ghost
  - **…or bring your own:** pick any `.gguf` file on your phone and it speaks through the board.
- It caches the weights in the browser's **Origin Private File System**, so the download happens once.

The rest is deliberately boring, open web tech, with **no build step and no dependencies**: plain ES modules, a service worker that keeps the app and the 9 MB llama.cpp runtime on the device, CSS for the board, synthesized WebAudio for the drone and the wooden "tock" of the planchette, and vendored open fonts (IM Fell English, SIL OFL).

### Three things I learned getting a 0.5B model to haunt a board

**1. Tiny models follow examples more than rules.** A list of rules ("answer in at most 6 words, uppercase, stay in character…") only gets you part of the way with a 0.5B model. With the examples pasted into the system prompt, it still drifted into long, lowercase sentences. What worked best was giving each spirit **three example exchanges as real chat turns** (`user: Where are you?` → `assistant: UNDER THE ICE`). Sub-1B models copy the *shape* of the conversation remarkably well.

**2. One bad answer poisons the séance.** My first build opened every séance with a stage-direction prompt ("*(The living person has opened the board. Announce yourself.)*"). The model produced gibberish, the gibberish went into the chat history, and every later answer got worse. Opening with a natural *"Is anyone here?"* fixed the whole session. With small models, the history is part of the prompt.

**3. Streaming makes it feel alive.** The model streams tokens into a word queue, and the planchette consumes that queue as soon as each word is finished. So the board starts moving while the model is still thinking, and the latency turns into suspense. Cleaning output into board-legal glyphs (A–Z, 0–9, YES, NO, GOOD BYE) happens on the fly, and since tiny models love to say "GOODBYE" in their very first message, a spirit isn't allowed to leave until it has answered a few questions.

## Why Does Open Innovation Matter?

**It works with the lights *and* the internet off.** This is a séance app. The best way to use it is in a dark room, ideally somewhere with no signal. A closed API would turn the most atmospheric moment, airplane mode on and the planchette still moving, into an error toast. With open weights running locally, the spirits don't need a network.

**Your dead stay yours.** The *Someone you remember* spirit asks for the name of a person you lost and the things they loved. That's about as personal as data gets. With an open model on the device, those memories go into `localStorage` and are only ever read by a model running on the same phone. There's no server I could leak them from, because there's no server.

**It costs nothing to run, so it can't be shut down.** There's no API bill and no key to rotate. The app is static files on GitHub Pages, and the weights are Apache-2.0. If I stop maintaining it tomorrow, it keeps working on every phone that has already opened it. That fits a holiday about things that outlive us.

**I can change how the ghost behaves.** Because I control the weights and the runtime, I could swap models per device, tune sampling for eerie answers, cap tokens to fit a board, and let users **bring their own GGUF**, whether a fine-tune, a different language, or a horror-tuned model. None of that is possible behind a closed endpoint.

**Where open beat closed for this project:** a frontier API would give smarter answers, but a Ouija spirit is *supposed* to be terse, cryptic and a little wrong. A 400 MB open model that runs offline, privately and for free on a phone fits the job better than a far bigger model that needs a network connection and a credit card.

## My Agent Session

<!-- Save the session with DevRelay and embed it here with the agent_session tag. -->

## The Spirit of It

<!-- Replace this with your own moment: try "Someone you remember" on your phone, with airplane mode on, for someone you miss. -->

During testing I gave *Someone you remember* a grandmother's name and two lines of memories: *tamales every Christmas*, *called me mijo*. Then I asked, "Do you remember the tamales?" The planchette crawled across the board and spelled out **YES I REMEMBER THE TAMALES**. It's a half-billion-parameter model doing next-token prediction. But it's running on the phone in your hand, with no one else listening, and for a second the line between past and present does feel a little thinner.

¡Feliz Día de los Muertos! And remember: **always say goodbye.** 🕯️
