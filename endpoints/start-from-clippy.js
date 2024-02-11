// the user is directed to the cave
const { transcript } = require('../util/transcript')
const { client } = require('../app')

module.exports = async function startFromClippy(req, res) {
  const { user_id } = req.query
  try {
    await Promise.all([
      client.chat.postEphemeral({
        text: transcript('announcements-to-cave'),
        channel: transcript('channels.announcements'),
        user: user_id,
      }),
    ])
  } catch (e) {}
  res.json({ pong: true })
}
