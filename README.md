# HiveNode

A virtual mesh network system with shell like cli interface, designed to manage multiple Node.js applications across multiple networks.

Still in development, highly unstable.

For my personal use.

## Description

Main usage:
- Remote Node.js applications management
- Providing encrypted communication channel between remote Node.js applications

## Getting Started

### Dependencies

<!-- 
* Describe any prerequisites, libraries, OS version, etc., needed before installing program.
* ex. Windows 10
-->

### Installing

<!-- 
* How/where to download your program
* Any modifications needed to be made to files/folders
-->

1. Fork this, run ```npm install```
2. Compile with ```npm run build``` to prepare tools
3. Compile with ```npm run build-full``` for complete compile with auto build version

### Executing program

<!-- 
* How to run the program
* Step-by-step bullets
-->

1. Prepare config file
Either manually create/edit config.json or use bootConfigEditor
Use command ```help parse``` for details about config options

2. Execute program
Run os.bat(uses '\config\config.json) or ```node dist/os/bios.js -configFile [path to config file] [...options]```

3. CLI usage
Tab once for auto-complete if avaliable, twice to get list of commands/sub-commands (for current command)
Add '$' before input to force input direct to local terminal shell
Ctrl + C to disconnect from remote terminal

## Help

<!-- 
Any advise for common problems or issues.
```
command to run if program contains helper info
```
-->
All CLI commands have ```help``` sub-command as default

## Authors

<!-- Contributors names and contact info -->
Rabbit

## Version History

Zero D:

## License

<!-- This project is licensed under the [NAME HERE] License - see the LICENSE.md file for details -->
I'll figure this out later

## Acknowledgments

Inspiration, code snippets, etc.
* [A simple README.md template](https://gist.github.com/DomPizzie/7a5ff55ffa9081f2de27c315f5018afc) for this readme.md
* [Commander.js](https://github.com/tj/commander.js) for the core basis of HiveCommand
