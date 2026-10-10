---
title: Conquest Reforged v.1.4.0 (MC 1.20.1)
date: 2025-09-13
category: Mod Updates
categorySlug: mod-updates
author: Hippokleides
---

::youtube[Ib8uWKL1YU4]

Another update for Conquest Reforged: this one brings a wide array of new basket models, "Brown Mortar Cobble" blocks, reworked mud textures, additional survival mechanics, and more!

**Modpack:**

- updated various mods
- update Fabric to 1.16.11
- add Distant Horizons to Fabric modpack. Performance hit seemed to severe in Forge modpack, but can be easily added by users.
- switch out JEI for REI

**Additions:**

- added down extension to planks

- Tall Woven Basket
- tall Woven hand Basket
- Unfinished Woven Basket
- Vintage Woven Hand Basket
- Woven Basket
- Woven Chest
- Woven Hand Basket
- Large Woven Basket
- Short Lidded Woven Basket
- Small Square Woven Basket
- Small Woven Basket
- Tall Lidded Woven Basket
- Empty Wicker Basket
- Wicker Basket of Firewood

- variants for vanilla Mud
- Dry Mud

- Worn Light Brown Mortar Cobbles
- Mossy Dark Brown Mortar Cobbles
- Overgrown Dark Brown Mortar Cobbles
- Heavily Overgrown Dark Brown Mortar Cobbles
- Clay Brick Mixed Dark Brown Mortar Cobbles
- Clay Brick Banded Dark Brown Mortar Cobbles

- Pale Limestone
- Rough Carved Limestone

- Black Persian Pillow
- William Morris Pillow
- Linen Cushion

- Simple Tall, Worn, and Simple Wooden Doors

- Cooking Brazier
- Terracotta Cooking Pot
- Bronze Cooking Pot
- Cast Iron Cooking Pot
- Fancy Mortar and Pestle
- Mortar and Pestle

- Round Bronze Lantern
- Copper, Iron, Bronze, and Cast Iron Candle Lanterns

- Short Broom
- Wooden Cross Stool
- Fabric Folding Stool
- Bronze Chest
- Scroll Stand

- Added an effect that slows the player when walking through dense foliage

- Added mallet item: use this for toggling variation shapes in survival mode (eg: arch shapes)

- New gamerule to permit or prohibit Conquest plants from breaking without a supporting block

**Changes:**

- update packed, thick mud, vanilla, and conquest mud textures
- White and Off-White Ashlars
- All cushions now have toggles and can be sat on
- Conquest Campfire has offset on layers now

- Brought back old feature where players and mobs can walk through leaf blocks
- Disable sometimes harsh ambient occlusion for leaf blocks

- Rocks reworked significantly. "Density" blockstate controls how dense and large the rocks are for greater control. "Edge" blockstate controls whether the rocks should be centered if there are surrounding air blocks below. North, South, East, and West states are removed.

- In survival, plants only have a hit-box when holding an axe
- implement various missing cem from conquest

**Fixes:**

- Improve mob pathing a bit on layers
- fix hanging moss, roots, spruce cones offset
- fix crash when using CR BlockPicker on entity or itemframe
- Addressed CR BlockPicker in Forge that was causing conflicts by not filtering out left and right-click when ctrl was held down
- fix skyboxes to work properly and have parity with Conquest pack. Most importantly, duplicate suns and moons gone.
- Optimized various old models (many made before Blockbench existed)
- Update base leaf textures to hopefully improve Distant Horizons LODs
- Optimized dynamic offset mechanic
- Addressed lighting being slighly different on extensions for the "Down Extension" mechanic. Culling issues also addressed
