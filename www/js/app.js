/* main application logic */

window.WfApp = function(settings) {
    const wiki = window.WfWiki
    settings = settings || {}
    const collections = settings.collections || {}
    console.log('app starts...')

    return {
        loadCollection: async function(id) {
            if (!(id in collections))
                throw new Error(`invalid collection ID: ${id}`)
            const col = collections[id]
            const res = await WfWiki.requestLaureates(col.page)
            console.log('laurs', res)
            return false
        }
    }
}
