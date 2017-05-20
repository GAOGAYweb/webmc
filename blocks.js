'use strict';
const websocket_stream = require('websocket-stream');
const webworkify = require('webworkify');
const workerstream = require('workerstream');
const typedArrayToBuffer = require('typedarray-to-buffer');
const mcData = require('./mcdata');
const EventEmitter = require('events').EventEmitter;
module.exports = function(game, opts) {
  return new BlocksPlugin(game, opts);
};
module.exports.pluginInfo = {
  loadAfter: [
      'voxel-land',
      'voxel-player',
      'voxel-registry',
      'voxel-console',
      'voxel-commands',
      'voxel-reach',
      'voxel-decals',
      'voxel-sfx',
      'voxel-carry',
      'voxel-use',
      'voxel-inventory-hotbar',]
};

function BlocksPlugin(game, opts) {

    this.game = game;
    this.opts = opts;

    this.registry = game.plugins.get('voxel-registry');
    if (!this.registry) throw new Error('voxel-clientmc requires voxel-registry plugin');

    if (this.game.voxels.voxelIndex) { // ndarray voxel removes this in https://github.com/maxogden/voxel/pull/18 TODO: better detection?
        throw new Error('voxel-clientmc requires voxel-engine with ndarray support');
    }

    this.console = game.plugins.get('voxel-console'); // optional
    this.commands = game.plugins.get('voxel-commands'); // optional
    this.reachPlugin = game.plugins.get('voxel-reach');
    if (!this.reachPlugin) throw new Error('voxel-clientmc requires voxel-reach plugin');
    this.decalsPlugin = game.plugins.get('voxel-decals');
    if (!this.decalsPlugin) throw new Error('voxel-clientmc requires voxel-decals plugin');
    this.sfxPlugin = game.plugins.get('voxel-sfx'); // optional
    this.carryPlugin = game.plugins.get('voxel-carry'); // optional
    this.usePlugin = game.plugins.get('voxel-use');
    if (!this.usePlugin) throw new Error('voxel-clientmc requires voxel-use plugin');
    this.hotbar = game.plugins.get('voxel-inventory-hotbar'); // optional

    this.handlers = {
        packet: (event) => {
            //this.websocketStream.write(typedArrayToBuffer(event.data));
        },

        error: (event) => {
            this.console.log('Disconnected with error: ' + event.error);
            //this.game.plugins.disable('voxel-clientmc');
        },

        close: (event) => {
            this.console.log('Websocket closed');
            //this.game.plugins.disable('voxel-clientmc');
        }
    };
    // require('./position.js')(this);
    // require('./kick.js')(this);
    // require('./chunks.js')(this);
    // require('./dig.js')(this);
    // require('./use.js')(this);
    // require('./block_break_animation.js')(this);
    // require('./sound.js')(this);
    // require('./chat.js')(this);
    // require('./inventory.js')(this);
    // require('./resource_pack.js')(this);
    this.enable();
}
BlocksPlugin.prototype.connectServer = function () {
    alert("here");
    this.log('voxel-clientmc connecting...');

    this.game.plugins.disable('voxel-land');   // also provides chunks, use ours instead
    //this.game.plugins.get('voxel-player').homePosition = [-248, 77, -198] // can't do this TODO
    //this.game.plugins.get('voxel-player').moveTo -251, 81, -309

    // login credential
    let username;
    const hash = document.location.hash;
    if (hash.length < 2) {
        // try anonymous auth
        username = 'user1';
    } else {
        username = hash.substring(1); // remove #
    }

    this.websocketStream = websocket_stream(this.opts.url);
    this.websocketStream.on('connect', () => {
        console.log('websocketStream connected, launching worker');

        this.mfworker = webworkify(require('./mf-worker.js'));
        this.mfworkerStream = workerstream(this.mfworker);

        // pass some useful data to the worker
        this.mfworkerStream.write({cmd: 'setVariables',
            username: username,
            translateBlockIDs: this.translateBlockIDs,
            reverseBlockIDs: this.reverseBlockIDs,
            defaultBlockID: this.defaultBlockID,
            chunkSize: this.game.chunkSize,
            chunkPad: this.game.chunkPad,
            chunkPadHalf: this.game.voxels.chunkPadHalf,
            chunkMask: this.game.voxels.chunkMask,
            chunkBits: this.game.voxels.chunkBits,
            arrayTypeSize: this.game.arrayType.BYTES_PER_ELEMENT
        });

        // handle outgoing mfworker data and commands
        this.mfworkerStream.on('data', (event) => {
            //console.log('mfworkerStream event',event);
            const cmd = event.cmd;
            const f = this.handlers[cmd];
            if (!f) {
                console.log('Unhandled mfworker cmd',cmd,event);
                return;
            }

            // call method on ourthis with arguments
            f.call(this, event);
        });

        // pipe incoming wsmc data to mfworker
        this.websocketStream.pipe(this.mfworkerStream);
    });

    this.emit('connectServer');
};
BlocksPlugin.prototype.enable = function() {
  this.registry.registerBlock('grass', {texture: ['grass_top', 'dirt', 'grass_side'], hardness:1.0, itemDrop: 'dirt', effectiveTool: 'spade'});
  this.registry.registerBlock('dirt', {texture: 'dirt', hardness:0.75, effectiveTool: 'spade'});
  this.registry.registerBlock('farmland', {texture: 'farmland_dry'});
  this.registry.registerBlock('mycelium', {texture: ['mycelium_top', 'dirt', 'mycelium_side']});
  this.registry.registerBlock('stone', {displayName: 'Smooth Stone', texture: 'stone', hardness:10.0, itemDrop: 'cobblestone', effectiveTool: 'pickaxe', requiredTool: 'pickaxe'});
  this.registry.registerBlock('waterFlow', {texture: 'water_flow'}); // TODO: animation
  this.registry.registerBlock('water', {texture: 'water_still'}); // TODO: animation
  this.registry.registerBlock('lavaFlow', {texture: 'lava_flow'}); // TODO: animation
  this.registry.registerBlock('lava', {texture: 'lava_still'}); // TODO: animation
  this.registry.registerBlock('sand', {texture: 'sand'});
  this.registry.registerBlock('gravel', {texture: 'gravel'});

  this.registry.registerBlock('oreGold', {displayName: 'Gold Ore', texture: 'gold_ore', hardness:15.0, requiredTool: 'pickaxe'});
  this.registry.registerBlock('oreIron', {displayName: 'Iron Ore', texture: 'iron_ore', hardness:15.0, requiredTool: 'pickaxe'});
  this.registry.registerBlock('oreCoal', {displayName: 'Coal Ore', texture: 'coal_ore', itemDrop: 'coal', hardness:15.0, requiredTool: 'pickaxe'});
  this.registry.registerBlock('oreLapis', {displayName: 'Lapis Lazuli Ore', texture: 'lapis_ore', hardness:15.0, requiredTool: 'pickaxe'});
  this.registry.registerBlock('oreDiamond', {displayName: 'Diamond Ore', texture: 'diamond_ore', hardness:15.0, requiredTool: 'pickaxe'});
  this.registry.registerBlock('oreRedstone', {displayName: 'Redstone Ore', texture: 'redstone_ore', hardness:15.0, requiredTool: 'pickaxe'});
  this.registry.registerBlock('oreEmerald', {displayName: 'Emerald Ore', texture: 'emerald_ore', hardness:15.0, requiredTool: 'pickaxe'});
  this.registry.registerBlock('oreNetherQuartz', {displayName: 'Nether Quartz Ore', texture: 'quartz_ore', hardness:15.0, requiredTool: 'pickaxe'});

  this.registry.registerBlock('logOak', {displayName: 'Oak Wood', texture: ['log_oak_top', 'log_oak_top', 'log_oak'], hardness:2.0, effectiveTool: 'axe', creativeTab: 'plants'});
  this.registry.registerBlock('cobblestone', {texture: 'cobblestone', hardness:10.0, effectiveTool: 'pickaxe', requiredTool: 'pickaxe'});
  this.registry.registerBlock('brick', {texture: 'brick'});
  this.registry.registerBlock('leavesOak', {displayName: 'Oak Leaves', texture: 'leaves_oak', transparent: true, hardness: 0.1, creativeTab: 'plants'});
  this.registry.registerBlock('leavesAcacia', {displayName: 'Acacia Leaves', texture: 'leaves_acacia', transparent: true, hardness: 0.1, creativeTab: 'plants'});
  this.registry.registerBlock('logBirch', {texture: ['log_birch_top', 'log_birch_top', 'log_birch'], hardness:2.0, displayName: 'Birch Wood', effectiveTool: 'axe', creativeTab: 'plants'});
  this.registry.registerBlock('logAcacia', {displayName: 'Acacia Wood', texture: ['log_acacia_top', 'log_acacia_top', 'log_acacia'], hardness:2.0, effectiveTool: 'axe', creativeTab: 'plants'});

  this.registry.registerBlock('sponge', {texture: 'sponge'});
  this.registry.registerBlock('glass', {texture: 'glass', transparent: true, hardness: 0.2});
  this.registry.registerBlock('blockLapis', {texture: 'lapis_block'});
  this.registry.registerBlock('sandstone', {texture: 'sandstone_normal'});

  this.registry.registerBlock('wool', {texture: 'wool_colored_white'}); // TODO: metablocks for colors TODO: use voxel-wool..

  this.registry.registerBlock('blockRedstone', {texture: 'redstone_block', displayName: 'Block of Redstone'}); // TODO: move to voxel-decorative?
  this.registry.registerBlock('blockEmerald', {texture: 'emerald_block', displayName: 'Block of Emerald'}); // TODO: move to voxel-decorative?
  this.registry.registerBlock('blockQuartz', {texture: 'quartz_block_side', displayName: 'Block of Quartz'}); // TODO: move to voxel-decorative?

  this.registry.registerBlock('tnt', {texture: ['tnt_top', 'tnt_bottom', 'tnt_side']});
  this.registry.registerBlock('bookshelf', {texture: 'bookshelf'}); // TODO: sides
  this.registry.registerBlock('stoneMossy', {texture: 'cobblestone_mossy'});
  this.registry.registerBlock('obsidian', {texture: 'obsidian', hardness: 128, requiredTool: 'pickaxe'});
  this.registry.registerBlock('snow', {texture: 'snow'});
  this.registry.registerBlock('ice', {texture: 'ice'});
  this.registry.registerBlock('cactus', {texture: ['cactus_top', 'cactus_bottom', 'cactus_side']});
  this.registry.registerBlock('clay', {texture: 'clay'});
  this.registry.registerBlock('jukebox', {texture: ['jukebox_top', 'planks_oak', 'jukebox_side']});
  this.registry.registerBlock('netherrack', {texture: 'netherrack'});
  this.registry.registerBlock('soulsand', {texture: 'soul_sand'});
  this.registry.registerBlock('glowstone', {texture: 'glowstone'});
  this.registry.registerBlock('portal', {texture: 'portal'});
  this.registry.registerBlock('blockMelon', {texture: ['melon_top', 'melon_top', 'melon_side']});
  this.registry.registerBlock('endstone', {texture: 'end_stone'});
  this.registry.registerBlock('lampOff', {texture: 'redstone_lamp_off'});
  this.registry.registerBlock('lampOn', {texture: 'redstone_lamp_on'});

  this.registry.registerBlock('noteblock', {texture: 'noteblock'});
  this.registry.registerBlock('dispenser', {texture: 'dispenser_front_horizontal'}); // TODO: direction
  this.registry.registerBlock('dropper', {texture: 'dropper_front_horizontal'}); // TODO: direction
  this.registry.registerBlock('mushroomBigRed', {texture: 'mushroom_block_skin_red'});
  this.registry.registerBlock('mushroomBigBrown', {texture: 'mushroom_block_skin_brown'});
  this.registry.registerBlock('brickNether', {texture: 'nether_brick'});
  this.registry.registerBlock('endPortalFrame', {texture: ['endframe_top', 'endframe_top', 'endframe_side']});
  this.registry.registerBlock('command', {texture: 'command_block'});
  this.registry.registerBlock('clayStainedWhite', {texture: 'hardened_clay_stained_white'});
  this.registry.registerBlock('clayHardened', {texture: 'hardened_clay'});
  this.registry.registerBlock('hayBale', {texture: ['hay_block_top', 'hay_block_top', 'hay_block_side']});

  //this.registry.registerBlock('missing', {texture: 'no_texture', displayName: 'Missing Block'}); // custom texture (TODO: standard location?)
  // TODO: more blocks

    this.game.on('engine-init', this.connectServer.bind(this));
};

BlocksPlugin.prototype.disable = function() {
  // TODO: unregister blocks
};

