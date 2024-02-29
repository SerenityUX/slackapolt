require("dotenv").config();
const { inviteUserToChannel } = require("./util/invite-user-to-channel");
const { mirrorMessage } = require("./util/mirror-message");
const { transcript } = require("./util/transcript");
const {
  postWelcomeCommittee,
} = require("./interactions/post-welcome-committee");
const express = require("express");

const { app, client } = require("./app.js");
const { receiver } = require("./express-receiver");
const { getInvite } = require("./util/get-invite");
const { sleep } = require("./util/sleep");
const { prisma } = require("./db");
const { metrics } = require("./util/metrics");
const { upgradeUser } = require("./util/upgrade-user.js");

receiver.router.use(express.json());

receiver.router.get("/ping", require("./endpoints/ping"));

const preselectedChannels = [
  "lounge",
  "scrapbook",
  "happenings",
  "ship",
  "welcome",
];

async function inviteGuestToSlack({ email, channels, _customMessage }) {
  // This is an undocumented API method found in https://github.com/ErikKalkoken/slackApiDoc/pull/70
  // Unlike the documention in that PR, we're driving it not with a legacy token but a browser storage+cookie pair

  // The SLACK_COOKIE is a xoxd-* token found in browser cookies under the key 'd'
  // The SLACK_BROWSER_TOKEN is a xoxc-* token found in browser local storage using this script: https://gist.github.com/maxwofford/5779ea072a5485ae3b324f03bc5738e1

  // I haven't yet found out how to add custom messages, so those are ignored for now
  const cookieValue = `d=${process.env.SLACK_COOKIE}`

  // Create a new Headers object
  const headers = new Headers()

  // Add the cookie to the headers
  headers.append('Cookie', cookieValue)
  headers.append('Content-Type', 'application/json')
  headers.append('Authorization', `Bearer ${process.env.SLACK_BROWSER_TOKEN}`)

  const data = JSON.stringify({
    token: process.env.SLACK_BROWSER_TOKEN,
    invites: [
      {
        email,
        // type: 'restricted',
        mode: 'manual',
      },
    ],
    // restricted: true,
    channels: channels.join(','),
  })

  return fetch(`https://slack.com/api/users.admin.inviteBulk`, {
    headers,
    method: 'POST',
    body: data,
  }).then((r) => r.json()).then(r => console.log(r));
}

// const addToChannels = async (user, event) => {
//   await upgradeUser(user)
//   await sleep(1000) // timeout to prevent race-condition during channel invites
//   const invite = await getInvite({ user })
//   let channelsToInvite = defaultChannels
//   if (event) {
//     channelsToInvite.push(event)
//     defaultChannels.push(event)
//   }
//   await Promise.all(
//     channelsToInvite.map((c) =>
//       inviteUserToChannel(user, transcript(`channels.${c}`))
//     )
//   )

//   await client.chat.postMessage({
//     text: transcript('house.added-to-channels', { suggestion }),
//     blocks: [
//       transcript('block.text', {
//         text: transcript('house.added-to-channels', { suggestion }),
//       }),
//     ],
//     channel: user,
//   })

//   // TODO weigh by reactions or just do something else entirely
//   const history = await client.conversations.history({
//     channel: transcript('channels.ship'),
//     limit: 10,
//   })
//   const message = history.messages[Math.floor(Math.random() * 10)]
//   const link = (
//     await client.chat.getPermalink({
//       channel: transcript('channels.ship'),
//       message_ts: message.ts,
//     })
//   ).permalink
// }

app.command(/.*?/, async (args) => {
  const { ack, payload, respond } = args;
  const { command, text, user_id, channel_id } = payload;

  try {
    const result = await client.views.open({
      trigger_id: payload.trigger_id,
      view: {
        callback_id: "invite_form",
        type: "modal",
        submit: {
          type: "plain_text",
          text: "Sling The Invite",
          emoji: true,
        },
        close: {
          type: "plain_text",
          text: "Throw Away Shot",
          emoji: true,
        },
        title: {
          type: "plain_text",
          text: "Pelting Station",
          emoji: true,
        },
        blocks: [
          {
            type: "section",
            block_id: "section678",
            text: {
              type: "mrkdwn",
              text: "What channels do you want to shoot your members into?",
            },
            accessory: {
              action_id: "text1234",
              type: "multi_channels_select",
              placeholder: {
                type: "plain_text",
                text: "Select channels",
              },
              initial_channels: ["C0266FRGV", "C0C78SG9L", "C0266FRGT"],
            },
          },
          {
            type: "input",
            element: {
              type: "email_text_input",
              action_id: "email_text_input-action",
            },
            label: {
              type: "plain_text",
              text: "What email should we shoot the invite to?",
              emoji: true,
            },
          },
          {
            type: "input",  // Add this block for Custom Invite Message
            element: {
              type: "plain_text_input",
              action_id: "custom_invite_message-action",
            },
            label: {
              type: "plain_text",
              text: "Words for your members to unravel once hit by the shot",
              emoji: true,
            },
          },
        ],
      },
    
    });


    await ack();
  } catch (error) {
    console.error(error);
    // Handle error as needed
  }
});


// Add event listener for view_submission to handle the submitted form
app.view("invite_form", async (args) => {
  const { ack, body, view, say } = args;
  const { user_id, trigger_id } = body.user;
  console.log(view.state.values)

  const channelsSelected = view.state.values.section678.text1234.selected_channels; // Extract selected channels
  
  console.log(channelsSelected)

  console.log(view.state.values)

  const emailInput = view.state.values.L12RZ["email_text_input-action"].value; // Extract email input
  console.log(emailInput)

  const customInviteMessage = view.state.values.wdFiS["custom_invite_message-action"].value; // Extract custom invite message
  console.log(customInviteMessage)

  await inviteGuestToSlack({
    email: emailInput,
    channels: channelsSelected,
    customMessage: customInviteMessage,
  })
  
    const emailData = {
      personalizations: [
        {
          to: [
            {
              email: emailInput, // Replace with the recipient's email address
            },
          ],
          subject: 'You just got hit by a slack-a-shot (Hack Club)',
        },
      ],
      from: {
        email: 'thomas@hackclub.com', // Replace with the sender's email address
      },
      content: [
        {
          type: 'text/html',
          value: `Hey! Your club leader invited you. Here is <i>a note</i> they left for you:<br/>
          <br/>
  "<b>${customInviteMessage}</b>" - Your Club Leader
  <br/>
  <br/>

You just received another email that contains the actual slack invite! Look forward to seeing you there!
<br/>
<br/>
~Thomas, Clubs
          `,
        },
      ],
    };
  
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SendGrid}`,
      },
      body: JSON.stringify(emailData),
    };
  
    try {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", requestOptions);
  
      if (!response.ok) {
        throw new Error(`Error sending email: ${response.statusText}`);
      }
  
      console.log('Email sent successfully!');
    } catch (error) {
      console.error('Error:', error.message);
    }
  


  // Move the 'await respond({ text: "Invite Sent" });' here
  await client.chat.postEphemeral({
    text: `Invite Sent to *${emailInput}* with an invite message of "*${customInviteMessage}*"`,
    user: body.user.id,
    channel: body.user.id
  });


  await ack();
});



app.start(process.env.PORT || 3001).then(async () => {
  console.log(transcript("startupLog"));
});

module.exports = { app };