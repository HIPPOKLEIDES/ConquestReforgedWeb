The Vanilla Minecraft Launcher offers the most stable, supportable, and surest way of successfully installing mods. However, this method can often confuse new players and hide the benefits for even experienced modders with unfamiliar terms. As a result, many modders are unaware that the Vanilla Minecraft Launcher allows one to seamlessly switch between different Minecraft versions without reorganizing their mod and resourcepack files while keeping separate configurations and settings for each version. All of this is accomplished easily with *custom Minecraft directories*.

What is a directory? A directory is essentially a folder on your computer where important files are stored. In this case, a Minecraft directory stores all of the files you use and make while playing the game. These files include: saves, screenshots, mods, resourcepacks, shaderpacks, configs, settings, crash-reports, game logs, and game versions. The default Minecraft directory is called the **.minecraft** folder (often found at `C:\Users\<your-computer-username>\AppData\Roaming\.minecraft`). If you’ve ever used the official Conquest Reforged launcher, you can find its Minecraft directories nearby sitting in `.conquestreforgedlauncher\instances`.

To make a custom Minecraft directory, we essentially need to follow the process for a [manual installation](/downloads), but with a few extra steps:

1. **Make a new, empty folder. This will be your new custom Minecraft directory.** To keep things organized, we’ve made this folder in the same location as the default Minecraft directory. For further organization, we’ve also specified the version and which mod or modpack the directory will contain, naming it **.minecraft1.15.2-CR**.
2. **In the vanilla Minecraft launcher, click on the *Installations* tab and hit the *New Installation* button.**
3. **For *Version* pick the appropriate version of Forge that you’d like your custom Minecraft directory to run.**
4. **For *Game Directory,* copy and paste the file path of the folder you made in the first step.**
5. **Hit *Less Options.* Scroll down so that you can see *JVM Arguments.* Change -Xmx2G so that you have enough RAM to run Conquest Reforged. 6G is the minimum, 8G is recommended (ie: -Xmx8G).**
6. **Hit *Save*. Then hit *Play* so that the game can generate all the necessary files and folders in your new directory.**
7. **Install your mods, resourcepacks, and shaderpacks into your new directory as you would in a [manual installation](/downloads).**
