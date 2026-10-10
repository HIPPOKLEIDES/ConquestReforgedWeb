WorldPainter is a powerful tool for creating custom terrains. With it, we can even make smooth snowy landscapes using Vanilla Minecraft’s snow layers. Conquest Reforged adds a plethora of layer blocks that emulate these snow layers and are perfect for terrains, but WorldPainter doesn’t support using these straight out of the box.

**Thankfully, with a bit of tweaking and a few steps, we can use Conquest Reforged layers in our terrains:**

1. Find the file called *worldpainter.vmoptions* located wherever you installed WorldPainter. For me, this was at `C:\Program Files\WorldPainter`. You’ll want to open this file.

![worldpainter.vmoptions location](/assets/66f41c5c2cc1dcf39e76f5a8_66f41be0b3c25a66b287cb39_worldpainter_layer_guide_1.webp)

2. Copy and paste this line into *worldpainter.vmoptions*: `-Dorg.pepsoft.worldpainter.smoothGroundCover=true`

![Editing worldpainter.vmoptions](/assets/66f41c5c2cc1dcf39e76f595_66f41c0d929deba359219638_worldpainter_layer_guide_2.webp)

3. Launch WorldPainter. Hit File -> New World (ctrl+n) and select [Beta] Minecraft 1.15 for the map format. Make sure *Extended block IDs* is enabled as well. If you have an existing world, you can hit

![New world dialog](/assets/66f41c5c2cc1dcf39e76f5b8_66f41c19302da2b4c79e0db8_worldpainter_layer_guide_3.webp)

4. Make a custom ground cover layer. This will be what adds the Conquest Reforged layers.

![Custom ground cover layer](/assets/66f41c5c2cc1dcf39e76f5b5_66f41c2b8c918dd1ef45d2ff_worldpainter_layer_guide_4.webp)

5. Create a *new custom material*. For this example, we’ll use Conquest Reforged’s grass layer. Hit *Custom* and enter in *conquest* for the first box and *grass_block_layer* for the second. This is the block id. For other layers you can find the id by opening Minecraft’s debug screen (hit f3 while in-game) and hovering other the block in question. Next, add a property, call it *layers,* and select *Integer* (default is boolean). Change the default number from 0 to 8 (this is the final layer shape).

![Custom material dialog](/assets/66f41c5c2cc1dcf39e76f5af_66f41c3a1996693ba7d94c9d_worldpainter_layer_guide_5.webp)

![Layers property](/assets/66f41c5c2cc1dcf39e76f5ab_66f41c46f38383699b6d34a9_worldpainter_layer_guide_6.webp)

6. Finish making your custom material and return to the custom ground layer window. Check off smooth. Then, press OK.

![Smooth option](/assets/66f41c5c2cc1dcf39e76f5b2_66f41c4e0bbdddeb946eaf02_worldpainter_layer_guide_7.webp)

7. You’re ready to start painting!
