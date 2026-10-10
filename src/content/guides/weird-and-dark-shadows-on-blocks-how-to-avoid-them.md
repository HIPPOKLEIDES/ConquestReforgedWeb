This is an issue with Minecraft lighting for block models that extend beyond the normal boundaries of a Minecraft block (ie: a 1x1x1 cube). Forge introduced fixes for these lighting issues, but Optifine disables these fixes. Fortunately, with a few tricks we can minimize these shadows in our builds.

Firstly, it will help to understand why and how these strange shadows appear. Essentially, Minecraft wants to apply ambient occlusion to a block so that lighting appears more naturally. When a block model goes beyond the normal Minecraft block boundaries, this lighting system becomes rather confused. The problem is made even worse by smooth lighting, which is normally designed to make this ambient occlusion look better for regular models, but simply doesn’t work well for these larger models.

**So how do we avoid ambient occlusion for the models where it looks bad? Full blocks generate ambient occlusion in the space around them, so by avoiding them where we can, we can avoid those nasty shadows completely.** A full block is essentially a block whose model and hitbox fully cover all six sides of their cubic block space. For clarity, the picture below shows a full block.

![A full block](/assets/66f41a192ac048b7fafba138_66f4199f37410c16e595b93d_weird_shadow_guide_1.webp)

A large model can be affected by a full block’s ambient occlusion if that full block lies within a 3x3x3 area around the large model. For example, we have a railed cart affected by a 3x3 road of cobblestone full blocks down below.

![Cart affected by cobblestone full blocks](/assets/66f41a192ac048b7fafba13d_66f419b5d146c3b0b9c42a8a_weird_shadow_guide_2.webp)

**When we replace the cobblestone full blocks with non-full blocks such as slabs (which aren’t full blocks since only one side of the block boundary is covered), these ugly shadows completely disappear**. With the wide array of shapes offered by Conquest Reforged, it’s possible to avoid these shadows without compromising your build.

![Shadows gone after switching to slabs](/assets/66f41a192ac048b7fafba140_66f419bfebdf444fe5d5dc4a_weird_shadow_guide_3.webp)

**Another way we can avoid these shadows without compromising our builds is by using the eighth layer of layer blocks**. This block shape essentially has the same model as a full block, but has a few special properties and a unique hitbox that disables troublesome ambient occlusion. Any layer block that has the *layers* property will work like this. Most ground cover blocks for terrains and a variety of cobblestones have this variant.

![Eighth layer block example](/assets/66f41a192ac048b7fafba143_66f419d0b3c25a66b2860b27_weird_shadow_guide_4.webp)

![Eighth layer block result](/assets/66f41a2eaf496a01a0c3db31_66f419e942ea07d72bdd1519_weird_shadow_guide_5.webp)

Finally, we can play with the smooth lighting settings to mitigate or remove these ugly shadows. **Turning smooth lighting to 0% or 5% can alleviate the issue, but overall this method has varying results and is unreliable as a sweeping solution.**

Note: Those of you who are knowledgeable about resource packs and models might suggest we disable ambient occlusion and shadows for individual model files, but this method only works situationally and has already been implemented where it works.
