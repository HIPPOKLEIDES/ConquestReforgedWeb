---
title: Open Beta
date: 2021-06-11
category: Mod Updates
categorySlug: mod-updates
author: Hippokleides
---

![Conquest Reforged 1.15 beta](/assets/66f3534b9c73e3764ef8f2a2_66f35342bccb9f877eb87872_1.15-beta_article_img.webp)

## A word from the devs:

The update, at last! Conquest Reforged for 1.15.2 is finally public. We're thrilled to release the hard work of a couple years spent improving old textures, adding loads of new blocks, shape variants, and creative features, as well as working towards a foundation far more stable for the future than ever before. While we'll initially be calling this a beta release to allow for any unexpected changes needed to address potential issues the community finds, this release should be stable, as there are no plans to remove, rename, or radically change blocks from here on out.

For those of you eager to convert your 1.12.2 worlds to 1.15.2, the converter is ready for download and use [here](https://github.com/Conquest-Reforged/WorldConverter/releases/tag/v.2.0.0). If you find any issues that you want corrected, leave an issue on the converter's Github repository, or create a pull request so that we can merge any additional conversion mappings and tweaks! As a warning: the converter is very sensitive to pre-existing issues affecting worlds, such as corruption, the addition/removal of mods adding blocks, and/or a general accumulation of junk in a very old world save folder. The converter has been repeatedly tested on fresh, fairly clean worlds in singleplayer. If you find that one of your worlds isn't converting nicely, you may have to look into either pasting the world's important builds into a new world, or somehow cleaning up your existing world.

With regards to Conquest Reforged 1.16.5, it is in the works and a closed alpha should be following shortly. Although it wasn't a hard update in the same vein as going from 1.12 to 1.13+, the update to official mojang mappings, a few odd changes to the system, and an updated resourcepack format should leave room for a few bugs or instabilities to be discovered. From what it looks like, worlds going from 1.15 to 1.16 will not need a converter. Generally, version updates should be much faster given the improved systems of Forge and Minecraft itself, along with our focus these past few years on cleaning up our own models, textures, and code.

Creative mode in 1.15.2 is the focus for Conquest Reforged. While survival mode in 1.15 is essentially relegated to vanilla systems and recipes, Conquest Reforged overall is far more compatible with the vast array of mods out there. We're a bit unsure of when we'll invest much time into overhauling and implementing survival, as vanilla Minecraft seems to not only be updating more rapidly, but also making major changes, such as a height limit increase and combat mechanic overhaul. It's possible that we'll take a look after 1.18 (December update).

Conquest Reforged's world generation itself has not been ported to 1.15. However, our incredible former developer Dags (now working for Hytale!) created a mod TerraForged that boasts a far better world generation, from realistic mountain ranges, rivers, continents, and even volcanoes. For anyone who needs solid terrain to build on, we highly recommend downloading TerraForged and using it with Conquest Reforged. Once we focus on survival, we plan on hooking into TerraForged to generate its incredible worlds with new biomes decorated by custom trees and our plethora of plants and rocks.

Finally, we owe a big thank you to our patrons and supporters who have supported us throughout the development of the mod. Your support has aided us so much in remaining focused and getting Conquest Reforged to this point throughout such a crazy year! We appreciate you all, and are honored that Conquest Reforged is valuable enough to you that you would support us financially.

### Beta Testing Guidelines

This following list outlines various bugs to look out for during the Conquest Reforged open beta.

If you encounter any, please open a separate bug report for each using the proper format on our [GitHub](https://github.com/Conquest-Reforged/Indev/issues/new/choose).

- Missing or wrong block textures
- Missing or wrong item textures
- Block texture and item texture don’t match (the texture in your hand looks different than the block that gets placed)
- Missing or wrong break particles (when breaking a block the particles that appear are either for a different block or use the purple and black missing texture)
- Wrong break sound (example: breaking stone sounds like leaves)
- Wrong step sound (example: walking on stone sounds like leaves)
- Missing or broken CTM
- Block missing from pallet GUI
- Block appears in wrong pallet GUI
- Single block Z-fighting. Does not apply when Z-fighting occurs when overlapping another block. (texture flickering on 3D models)
- Duplicate blocks
- Missing blocks in tabs
- Duplicate blocks in tabs
- Placement mechanic doesn’t work as expected/is annoying

Without further ado, a General Changelog:

### General Changelog:

Since there are too many changes for a full changelog to be practical, this will serve to outline most major changes going from 1.12.2-1.15.2. There are many more individual changes, additions, and removals in the update. Removals are largely limited to the removal of some shapes for certain blocks or texture changes/revamps that could be construed as removals.

#### Trees:

- All leaf textures and models redone to replace better foliage compatibility
- New palm leaves
- Log wall and fence models redone to look more like branches
- New branch models
- Stump block variant (like a pillar/small-pillar) for logs that extends down into a (snow) layer underneath it

#### Foliage:

- Plants and rocks can now be placed on layers without floating
- Various old textures revamped + new additions
- Improved models for many plants, even those that stack (eg: cat-tails, reeds)
- Can be waterlogged (replaces better foliage's reed functionality)

#### General Additions and Changes:

- Added approximately four thousand new blocks to the mod
- New round, gothic, and segmental arch models extending up to 3 meters
- Glass panes can extend up into arches, stairs, and slabs
- Revamped many old Ardacraft textures to Conquest standards
- Revamped Greco-Roman marbles and plaster textures up to Conquest standards
- Larger selection of textures with classical models (eg: travertine, dark sandstone, limestone plinths, cornices, architraves)
- Vertical slabs and vertical corners now have layers (vertical trapdoors have been merged into vertical slabs)
- Almost all slabs have snow-like layers (horizontal trapdoors have been merged into horizontal slabs)
- Pillars now have variable thicknesses (small pillars have been merged into pillar block)
- New quarter slab, eighth slab, and various other shapes added
- New pipe models in multiple colors and worn states
- Many industrial blocks and textures added including hull plating, shipping containers, corrugated metal, steel beams, scaffolding, and barbed wire
- New concrete textures
- Pillows added
- Many new carpets and rugs
- Chairs can now be rotated and placed upside-down on tables
- New doors including three meter variants
- Various new decorative models (candelabra, pots, urns, cabinets, etc)
- Some food blocks now have multiple models based on ‘bite’ state
- Revamped shutter textures and mechanics
- Revamped thatch and roof block textures
- New wooden post and lintels
- Improved beams to include diagonal and cross models
- New mosaic blocks
- Updated many old cross models (ie: scale, hourglass)
- Improved animal blocks (no longer have multiple heads)
- Added smoke particle blocks
- Wheels now have individual models with offset feature
- Removed survival functionality (may be revisited after 1.18)

#### Features:

- Many blocks in general waterloggable
- New dependency screen at startup to check if Optifine and the Conquest Reforged resourcepack have been installed
- New intro screen at startup outlining essential keybinds for Conquest Reforged
- Added block thickness toggle (no default keybind to prevent accidental activation) so that you don't have to manually stack layers for slabs, "snow" layers, vertical slabs, etc. Default value of 0 for regular layer stacking, 1-7 for locking onto a specific size
- Added "ctrl + middle-mouse-click" keybind. While looking at a block and pressing this keybind you get a block item with the exact shape/blockstate of what you were looking at
- Removed color functionality from the palette GUI. Block variant picking keybind switched from ‘C’ to ‘V’ to prevent conflicts with Optifine zoom
- Added vanilla debug stick to ‘utility’ tab for easy access

#### Technical Changes:

- Full block grassy gravel/dirt/sand removed due to rendering glitches and replaced with Optifine overlay. Grassy gravel/dirt/sand layers remain. Old (1.12) method for grassy gravel/dirt/sand was unsustainable and inefficient (removal reduces texture atlas by 10-15%)
- Optimized and reorganized creative tabs. First page for general refined blocks (cobble, planks, etc), second page for refined but more decorative blocks (metals, tools, furniture). Third page for natural blocks (foliage, stone, dirt). Fourth page for items and miscellaneous/utility blocks.
- Removed placeholder green "none" blocks
- Z-fighting largely reduced or eradicated for most models and textures
- Many block models now have proper culling (not just full-blocks anymore) reducing in-game performance load

#### Stats (1.15.2):

- Vanilla Blocks: 680
- Conquest Blocks: 12,366
- **Total Blocks: 13,046**
- Vanilla Blockstates: 11,337
- Conquest Blockstates: 351,459
- **Total Blockstates: 362,796**
