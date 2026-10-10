---
title: FAQ
description: Got some general questions about the mod. These Answers might help.
heading: FAQ
---

### Can I use Conquest Reforged in my mod-pack?

You're welcome to make a mod-pack on Curseforge or Modrinth. Otherwise please do not redistribute Conquest Reforged or any of its assets.

### How do I make a server with Conquest Reforged?

Conquest Reforged is a mod, so you’ll need a server that’s running the mod-loaders Fabric or Forge (whichever you plan on using). If you’ve ever installed mods onto a server before, the process will essentially be the same. For a more thorough beginners guide on setting up a server, see [this guide](/guides/creating-a-modded-server-with-conquest-reforged).

### Why aren’t my connected textures working?

First, we need to be clear on what connected textures means. Connected textures is a feature that enables repeating, vertical, horizontal, and random patterns as well as transitions between blocks. The vanilla Conquest resource-pack introduces transitions between different kinds of blocks (eg: a smooth transition between sand and gravel). This aspect of connected textures is incomplete and a bit buggy at best, and as such hasn’t been implemented for Conquest Reforged on a large scale. Often players complain that their connected textures aren’t working when in fact they are working, as they’re conflating these transitions with all connected textures.

If this isn’t the case for you and your connected textures are indeed not working, there are a few things to check. First make sure you're using the [Conquest Reforged Mod-pack](https://modrinth.com/modpack/conquest-reforged-modpack). This contains mods like Continuity that apply our connected textures. Using both the Conquest Reforged and the Vanilla Conquest resource-pack at the same time is not supported.

Hit the *Quality* button in your settings and make sure Connected Textures is set to fancy.

Versions prior to Minecraft 1.19 require Optifine and the [Conquest Reforged resource-pack](https://modrinth.com/resourcepack/conquest-reforged-resource-pack) for Connected textures.

### Why are there weird dark shadows on some blocks?

This is an issue with Minecraft lighting for block models that extend beyond the normal boundaries of a 1x1x1 cube. Fortunately, with a few tricks we can minimize these shadows in our builds. See [this guide](/guides/weird-and-dark-shadows-on-blocks-how-to-avoid-them) for more information.

### How do I find my world-saves, screenshots, shaderpacks, mod files, or crash-logs?

The easiest way is to launch the game, click “*Options*” and then “*Resource Packs*” button. Hit “*Open Resource Pack Folder*”. Your file explorer should pop up. Navigate one folder back. This is your Minecraft directory.

### Is Conquest Reforged compatible with survival? What are the plans for survival in the future?

The 1.12.2 version of Conquest Reforged introduced a basic, yet incomplete and generally mod-incompatible version of survival. This was scrapped in 1.15.2 to make way for cleaner future developments. Versions after 1.12 and prior to 1.20 require the [Conquest Reforged Recipes pack.](https://www.curseforge.com/minecraft/mc-mods/conquest-reforged-recipes)

The latest version of Conquest Reforged includes recipes and loot-tables for all of the blocks. Further developments, especially with regards to worldgen may come in the future once ReTerraforged is out of beta.

### Will Conquest Reforged come to the Bedrock Edition of Minecraft?

A full and complete port to Bedrock Edition isn’t possible due to the size and scope of Conquest Reforged. Moreover, fully connected textures are not possible. In any case, we may explore ways to bring a taste of Conquest Reforged to Bedrock, even if that means the full Conquest experience isn’t possible on that platform. With that being said, we do offer a [resource-pack on the Minecraft Marketplace](https://www.minecraft.net/en-us/marketplace/pdp?id=dab46648-9fa3-4d2b-8570-139c451c9d49) that brings Conquest textures to Bedrock.
