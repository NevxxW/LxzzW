require('@noble/ciphers');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { StayTube, YtDlpPlugin } = require('staytubejs');

const PREFIX = process.env.PREFIX || '^';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const player = new StayTube(client, {
  plugins: [new YtDlpPlugin()],
  leaveOnEmpty: false,
  leaveOnFinish: false,
  leaveOnStop: false,
  defaultVolume: 50,
});

function nowPlayingRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('np_pauseresume').setEmoji('⏯️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('np_skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('np_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('np_loop').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('np_queue').setEmoji('📜').setStyle(ButtonStyle.Secondary)
  );
}

function nowPlayingEmbed(queue, song) {
  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setAuthor({ name: 'Lynette • Now Playing' })
    .setTitle(song.name)
    .setURL(song.url)
    .setThumbnail(song.thumbnail)
    .addFields(
      { name: 'Duration', value: song.formattedDuration || 'Unknown', inline: true },
      { name: 'Requested By', value: `<@${song.member.id}>`, inline: true },
      { name: 'Volume', value: `${queue.volume}%`, inline: true }
    )
    .setFooter({ text: `Lynette • Queue: ${queue.songs.length} song(s)` });
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setActivity(`${PREFIX}play | Lynette`, { type: 2 });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const voiceChannel = message.member?.voice?.channel;

  if (command === 'play' || command === 'p') {
    if (!voiceChannel) return message.reply('Join a voice channel first.');
    const query = args.join(' ');
    if (!query) return message.reply('Provide a song name or URL.');
    try {
      await player.play(voiceChannel, query, {
        member: message.member,
        textChannel: message.channel,
      });
    } catch (e) {
      message.reply(`Error: ${e.message}`);
    }
  }

  if (command === 'skip' || command === 's') {
    await player.skip(message.guildId);
    message.reply('Skipped.');
  }

  if (command === 'stop') {
    await player.stop(message.guildId);
    message.reply('Stopped.');
  }

  if (command === 'pause') {
    await player.pause(message.guildId);
    message.reply('Paused.');
  }

  if (command === 'resume') {
    await player.resume(message.guildId);
    message.reply('Resumed.');
  }

  if (command === 'queue' || command === 'q') {
    const queue = player.getQueue(message.guildId);
    if (!queue || !queue.songs.length) return message.reply('Queue is empty.');
    const list = queue.songs
      .map((s, i) => `**${i + 1}.** ${s.name} — \`${s.formattedDuration}\``)
      .slice(0, 15)
      .join('\n');
    message.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle('Queue').setDescription(list)] });
  }

  if (command === 'volume' || command === 'v') {
    const vol = parseInt(args[0]);
    if (isNaN(vol) || vol < 1 || vol > 100) return message.reply('Volume must be 1–100.');
    await player.setVolume(message.guildId, vol);
    message.reply(`Volume set to ${vol}%.`);
  }

  if (command === 'loop') {
    const mode = args[0];
    if (mode === 'song') await player.setLoopMode(message.guildId, 1);
    else if (mode === 'queue') await player.setLoopMode(message.guildId, 2);
    else await player.setLoopMode(message.guildId, 0);
    message.reply(`Loop mode: ${mode || 'off'}`);
  }

  if (command === 'np' || command === 'nowplaying') {
    const queue = player.getQueue(message.guildId);
    if (!queue || !queue.songs.length) return message.reply('Nothing is playing.');
    message.reply({ embeds: [nowPlayingEmbed(queue, queue.songs[0])], components: [nowPlayingRow()] });
  }

  if (command === '247' || command === 'stay') {
    const queue = player.getQueue(message.guildId);
    if (queue) {
      queue.leaveOnEmpty = false;
      queue.leaveOnEnd = false;
      queue.leaveOnStop = false;
    }
    message.reply('24/7 mode enabled.');
  }
});

player.on('playSong', (queue, song) => {
  queue.textChannel?.send({
    embeds: [nowPlayingEmbed(queue, song)],
    components: [nowPlayingRow()],
  });
});

player.on('addSong', (queue, song) => {
  queue.textChannel?.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x2b2d31)
        .setDescription(`➕ Added **${song.name}** to queue.`),
    ],
  });
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const { customId, guildId } = interaction;

  try {
    if (customId === 'np_pauseresume') {
      const queue = player.getQueue(guildId);
      if (!queue) return interaction.reply({ content: 'Nothing playing.', ephemeral: true });
      if (queue.paused) {
        await player.resume(guildId);
        return interaction.reply({ content: 'Resumed.', ephemeral: true });
      } else {
        await player.pause(guildId);
        return interaction.reply({ content: 'Paused.', ephemeral: true });
      }
    }

    if (customId === 'np_skip') {
      await player.skip(guildId);
      return interaction.reply({ content: 'Skipped.', ephemeral: true });
    }

    if (customId === 'np_stop') {
      await player.stop(guildId);
      return interaction.reply({ content: 'Stopped.', ephemeral: true });
    }

    if (customId === 'np_loop') {
      const queue = player.getQueue(guildId);
      const next = ((queue?.loopMode ?? 0) + 1) % 3;
      await player.setLoopMode(guildId, next);
      const names = ['Off', 'Song', 'Queue'];
      return interaction.reply({ content: `Loop: ${names[next]}`, ephemeral: true });
    }

    if (customId === 'np_queue') {
      const queue = player.getQueue(guildId);
      if (!queue || !queue.songs.length) {
        return interaction.reply({ content: 'Queue empty.', ephemeral: true });
      }
      const list = queue.songs
        .map((s, i) => `**${i + 1}.** ${s.name} — \`${s.formattedDuration}\``)
        .slice(0, 15)
        .join('\n');
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle('Queue').setDescription(list)],
        ephemeral: true,
      });
    }
  } catch (e) {
    if (!interaction.replied) {
      interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
    }
  }
});

process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);

client.login(process.env.DISCORD_TOKEN);
