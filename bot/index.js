const _ = require('lodash');
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const wit = require('node-wit').Wit;
const config = require('./config');
const TokenClient = require('./a15Clients').TokenClient;
const CatalogClient = require('./a15Clients').CatalogClient;

const witToken = config.witai.serverAccessToken;
const tokenClient = new TokenClient(`${config.baseURL}${config.a15.urls.token}`);
const catalogClient = new CatalogClient(`${config.baseURL}${config.a15.urls.catalog}`);

const responseFunctions = {
    'search': search,
    'greeting': greeting,
    'unknown': unknown,
    'cart': cart
}

const app = express();

app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(__dirname + '/views'));
app.set ('view engine', 'ejs');

app.get('/bot/talk', async (req, res) => {
    res.render('test');
});

app.post('/bot/talk', async (req, res) => {
    const text = req.body.text;
    const prevSearchTerm = _.get(req, 'body.searchTerm', '');
    const searchTerm = text;
    let token = _.get(req.cookies, 'urbn_auth_payload');

    console.log(token);

    if (_.isString(token)) {
        token = JSON.parse(token);
    }
    
    const client = new wit({accessToken: witToken});
    const witAIData = await client.message(searchTerm, {});
    const responseType = determineResponseType(witAIData);

    if (!token) {
        tokenResponse = await tokenClient.getGuestToken();
    } else {
        tokenResponse = token;
    }
    //console.log('token response ', JSON.stringify(tokenResponse, null, 2));
    // token = _.get(tokenResponse, 'authToken');
    res.send(await responseFunctions[responseType](witAIData,res,tokenResponse,searchTerm,prevSearchTerm));     
});

function determineResponseType(witAIData) {
    if(_.get(witAIData, 'entities.greetings')) {
        return 'greeting';
    } else if(_.get(witAIData, 'entities.local_search_query') || _.get(witAIData, 'entities.intent.0.value') == 'color') {
        return 'search';
    } else if(_.get(witAIData, 'entities.intent.0.value') == 'cart') {
        return 'cart';
    } else {
        return 'unknown';
    }
}

async function greeting(witAIData) {
    return generateClientResponse('greeting', "Hi, I'm Franco. What can I help you find today?");
}

async function search(witAIData, res, token, searchTerm, prevSearchTerm) {

    // let urbnQueryItems = [];
    // let searchQuery = _.get(witAIData, 'entities.local_search_query', {});

    // searchQuery.forEach((item) =>{
    //     urbnQueryItems.push(item.value);
    // })
    let searchValue;
    if(_.get(witAIData, 'entities.local_search_query')) {
        searchValue = _.get(witAIData, 'entities.local_search_query.0.value') + ' ' + prevSearchTerm;
    } else {
       searchValue = searchTerm + ' ' + prevSearchTerm; 
    }
    
    if(_.get(witAIData, 'entities.intent', false) || prevSearchTerm != '') {
        let catalogSearchResults;
        let returnedProducts = [];

        try{
            catalogSearchResults = await catalogSearch(witAIData,res,token,searchValue);
            let jsonResult = JSON.parse(catalogSearchResults);
            let records = jsonResult.records;

            records.forEach((record) => {
                recordMeta = _.get(record, 'allMeta.tile.product');
                returnedProducts.push(recordMeta);
            })
        } catch(event) {
            console.log(event);
        }
        return generateClientResponse('product', "Here's what I found for you today", searchValue, catalogSearchResults, witAIData)
    }
    else {
        return generateClientResponse('color', 'What color would you like that in?', searchValue, {}, witAIData);
    }
}

async function unknown(witAIData, res, token, searchValue) {
    return generateClientResponse('unknown', "I'm sorry.  I don't understand.  Can you simplify your response?");
}

async function refinement(witAIData, res, token, searchValue) {
    return generateClientResponse('refinement', 'Heres the product in ')
}

async function cart(witAIData, res, token, searchTerm, prevSearchTerm) {
    return generateClientResponse('cart', 'No problem. Its been added to your cart', searchTerm, {}, witAIData);
}

function generateClientResponse(responseType, textResponse = '', searchValue = '', additionalData = {}, witAIData = {}) {
    console.log(searchValue);
    console.log(witAIData);
    return {
        responseType,
        textResponse,
        searchValue,
        additionalData,
        witAIData
    }
}

async function catalogSearch(data,res,token,searchTerm) {
    res.cookie('urbn_auth_payload', token);
    return await catalogClient.search(searchTerm, token);
}

app.listen(config.port);
