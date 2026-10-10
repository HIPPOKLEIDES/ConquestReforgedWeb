---
title: Blocks Oplenny for Your Penny
date: 2020-02-28
category: Mod Updates
categorySlug: mod-updates
---

![Conquest Reforged 1.15 alpha](/assets/66f353e961a90f310ac2aaa9_66f353e5fc18e100da520581_1.15_patreon_article_img.webp)

### Hey everyone,

We are releasing an alpha version of 1.15.2 Conquest Reforged to our patrons/donators as we await Forge-compatible Optifine for 1.15.2, whose release date is pretty uncertain. While connected textures won't be available, there are loads of new blocks, models, and mechanics to check out and get an idea with what you'll be able to achieve with the next iteration of Conquest Reforged.

In order to gain access to the alpha build, join our [Discord](https://discord.gg/ZagrZvn) and [donate here](https://donatebot.io/checkout/164052674637987840) for a special role that will give you the ability to download both Conquest Reforged and Terraforged.

Since this is an alpha and work-in-progress, we're very open to feedback regarding what we can improve. With that, here is a rough changelog:

### Conquest Reforged 1.15.2 Alpha Changelog

#### Blocks/Items/Models:

- A full list will be compiled for the official release
- The mod now has 11,827 blocks/models (subject to change)

#### Block Variants:

- Gothic Arches, Segmental Arches, Round Arches
- Old half arch model removed (open to potential replacements for specific use cases)
- Upside-down capitals/hopper shapes
- Slabs now have “layers”. These layers can be placed upside-down
- Corner Slab added
- Eighth Slab added
- Quarter Slab added
- Two new shapes for the Sphere/Dragon Egg block
- Vertical Corner blocks, Vertical Quarter blocks, and Vertical Slabs all have 3 “layer” shapes. Therefore, previous trapdoor and vertical slabs are merged
- “Trapdoor” shape is now 8 pixels (32 pixels being a full-block) wide instead of 6 pixels, to be proportional with the other Vertical Slab layers.
- Vertical Slab Corner (looks like a stair cut in half) added
- Glass blocks now have Vertical Corners, Vertical Quarters, Vertical Slabs with working culling

#### Mechanics:

- Plants and rocks now “sink” into layers, so that they don’t appear as if they’re floating in mid-air when placed above them.
- Pressing ‘B’ toggles between layers when placing snow/similar variants
- Experimental variant toggle GUI when pressing “B” (can be enabled in the configs)
- Most blocks can be waterlogged

#### Interface/GUI:

- Prompt to install Optifine/Resourcepack, if missing, on startup (can be disabled after first launch)
- Notification that explains how to use the block picker GUI when the creative inventory is opened for the first time
- Block picker GUI color palette functionality has been removed
- Block picker settings have not been fully implemented yet. Some of the options can be found & adjusted in the client config file (UI elements will be added later)
- “Bite” food variants now appear in the block picker
- Replaced vanilla GUI textures in the title screen and realms page with Conquest ones
- Added Conquest GUI textures for new vanilla workstations
- Reorganized Creative Tabs

#### Survival:

- Removed Conquest world generation (will be replaced with the TerraForged mod)
- Breaking plants by hand no longer drops them as an item
- Until new tree assets are created, saplings will no longer grow into trees
- Removed all block/item recipes until new crafting mechanics are implemented

#### Bug/General Fixes:

- Fixed Z-fighting on 3D models
- Removed all unused blockstates (green “none” blocks)
