var { h, computed, when, map, send } = require('mutant')
var nest = require('depnest')
var extend = require('xtend')
var moment = require('moment-timezone')

var localTimezone = moment.tz.guess()

exports.needs = nest({
  'message.html.markdown': 'first',
  'message.html.layout': 'first',
  'message.html.decorate': 'reduce',
  'message.async.publish': 'first',
  'keys.sync.id': 'first',
  'about.html.image': 'first',
  'about.obs.latestValue': 'first',
  'about.obs.groupedValues': 'first',
  'about.obs.valueFrom': 'first',
  'about.obs.name': 'first',
  'contact.obs.following': 'first',
  'blob.sync.url': 'first',
  'gathering.sheet.edit': 'first'
})

exports.gives = nest('message.html', {
  canRender: true,
  render: true
})

exports.create = function (api) {
  var following = null

  return nest('message.html', {
    canRender: isRenderable,
    render: function (msg, opts) {
      if (!isRenderable(msg)) return

      var yourId = api.keys.sync.id()
      var hidden = api.about.obs.valueFrom(msg.key, 'hidden', yourId)
      var image = api.about.obs.latestValue(msg.key, 'image')
      var title = api.about.obs.latestValue(msg.key, 'title')
      var description = api.about.obs.latestValue(msg.key, 'description')
      var location = api.about.obs.latestValue(msg.key, 'location')
      var startDateTime = api.about.obs.latestValue(msg.key, 'startDateTime')
      // var endDateTime = api.about.obs.latestValue(msg.key, 'endDateTime')
      var attendees = computed([api.about.obs.groupedValues(msg.key, 'attendee')], getAttendees)
      if (!following) {
        following = api.contact.obs.following(yourId)
      }

      var imageUrl = computed(image, (id) => api.blob.sync.url(id))
      var imageId = computed(image, (link) => (link && link.link) || link)
      var content = h('GatheringCard', [
        h('div.title', [
          h('a', {
            href: msg.key
          }, title),
          h('button', {
            'ev-click': send(api.gathering.sheet.edit, msg.key)
          }, 'Edit Details')
        ]),
        h('div.time', computed(startDateTime, formatTime)),
        when(image, h('a.image', {
          href: imageId,
          style: {
            'background-image': computed(imageUrl, (url) => `url(${url})`)
          }
        })),
        h('div.attending', [
          h('div.title', ['Attendees', ' (', computed(attendees, (x) => x.length), ')']),
          h('div.attendees', [
            map(attendees, (attendee) => {
              return h('a.attendee', {
                href: attendee,
                title: nameAndFollowWarning(attendee)
              }, api.about.html.image(attendee))
            })
          ]),
          h('div.actions', [
            h('button -attend', {
              'ev-click': send(publishAttending, msg.key)
            }, `Attending`),
            h('button -attend', {
              'ev-click': send(publishNotAttending, msg.key)
            }, `Can't Attend`)
          ])
        ]),
        h('div.location', markdown(location)),
        when(description, h('div.description', markdown(description)))
      ])

      var element = api.message.html.layout(msg, extend({
        content,
        miniContent: 'Added a gathering',
        layout: 'mini'
      }, opts))

      // hide if no title set or hidden
      var visible = computed([title, hidden], (title, hidden) => {
        return title && !hidden
      })

      return when(visible, api.message.html.decorate(element, {
        msg
      }))
    }
  })

  function publishAttending (id) {
    var yourId = api.keys.sync.id()

    // publish with confirm
    api.message.async.publish({
      type: 'about',
      about: id,
      attendee: {
        link: yourId
      }
    })
  }

  function publishNotAttending (id) {
    var yourId = api.keys.sync.id()

    // publish with confirm
    api.message.async.publish({
      type: 'about',
      about: id,
      attendee: {
        link: yourId,
        remove: true
      }
    })
  }

  function nameAndFollowWarning (id) {
    var yourId = api.keys.sync.id()
    return computed([api.about.obs.name(id), id, following], function nameAndFollowWarning (name, id, following) {
      if (id === yourId) {
        return `${name} (you)`
      } else if (following.includes(id)) {
        return `${name}`
      } else {
        return `${name} (not following)`
      }
    })
  }

  function markdown (obs) {
    return computed(obs, (text) => {
      if (typeof text === 'string') return api.message.html.markdown(text)
    })
  }
}

function formatTime (time) {
  if (time && time.epoch) {
    return moment(time.epoch).tz(localTimezone).format('LLLL zz')
  }
}

function getAttendees (lookup) {
  return Object.keys(lookup)
}

function isRenderable (msg) {
  return (msg.value.content.type === 'gathering') ? true : undefined
}
