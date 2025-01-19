const { google } = require("googleapis");

const SPREADSHEET_ID = "1BtR0inNvEgDdhorb6sgSx6s3my3MO4RG5QysY28mhGQ";
const SHEET_NAME = "Sheet1"; 

// Retrieve the credentials from the environment variable
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

// Encircle API configuration
const claimsEndpoint = "https://api.encircleapp.com/v1/property_claims"; 
const bearerToken = JSON.parse(process.env.BEARER_TOKEN); 
const headers = {
    "Authorization": `Bearer ${bearerToken}`,
    "Content-Type": "application/json",
};

// Function to get the latest contractor identifier from Encircle
async function getLatestClaimContractorIdentifier() {
    try {
        const response = await fetch(claimsEndpoint, {
            method: "GET",
            headers: headers,
        });

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const rawResponse = await response.text();
        const parsedResponse = JSON.parse(rawResponse);
        const claims = parsedResponse.list || [];

        if (!Array.isArray(claims) || claims.length === 0) {
            throw new Error("No claims found in the response.");
        }

        const latestClaim = claims[0];

        if (!latestClaim.contractor_identifier) {
            return null; 
        }

        return latestClaim.contractor_identifier;
    } catch (err) {
        console.error("An error occurred:", err.message);
        throw new Error("Failed to retrieve the latest claim's contractor identifier.");
    }
}

// Function to get the next contractor identifier (PO number)
async function getNextContractorIdentifier() {
    try {
        const latestContractorIdentifier = await getLatestClaimContractorIdentifier();

        if (latestContractorIdentifier === null) {
            return "RR00001"; 
        }

        const numericPart = parseInt(latestContractorIdentifier.replace("RR", ""), 10);
        return `RR${(numericPart + 1).toString().padStart(5, "0")}`;
    } catch (error) {
        console.error("Error retrieving the latest sequence from Encircle:", error.message);
        throw new Error("Failed to retrieve the latest sequence from Encircle.");
    }
}

// Function to append data to Google Sheets
async function appendToGoogleSheet(data) {
    try {
        const auth = new google.auth.GoogleAuth({
            credentials: credentials,
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });

        const authClient = await auth.getClient();

        const request = {
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A2:D2`, 
            valueInputOption: "RAW",
            resource: {
                values: [data],
            },
            auth: authClient,
        };

        const response = await google.sheets("v4").spreadsheets.values.append(request);
        console.log("Successfully appended data to Google Sheets:", response.data);
    } catch (error) {
        console.error("Error appending to Google Sheets:", error.message);
        throw new Error("Failed to append data to Google Sheets.");
    }
}

// Endpoint to create a claim and append data to Google Sheets
module.exports.handler = async (event, context) => {
    try {
        const { policyholder_name, full_address, project_manager_name } = JSON.parse(event.body);

        if (!policyholder_name || !full_address || !project_manager_name) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Missing required claim data." }),
            };
        }

        const nextSequence = await getNextContractorIdentifier();
        console.log("Next PO Number:", nextSequence);

        const newClaim = {
            organization_id: "d622f922-8ce2-4ded-a44b-37fa3dac1aa4", 
            brand_id: 283549, 
            contractor_identifier: nextSequence,
            policyholder_name: policyholder_name,
            full_address: full_address,
            project_manager_name: project_manager_name,
        };

        const response = await fetch(claimsEndpoint, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(newClaim),
        });

        if (response.ok) {
            const createdClaim = await response.json();
            console.log("New claim created successfully:", createdClaim);

            const data = [nextSequence, policyholder_name, full_address, project_manager_name];
            await appendToGoogleSheet(data);

            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: "Claim successfully created and data appended to Google Sheets.",
                    contractorIdentifier: nextSequence,
                }),
            };
        } else {
            const errorText = await response.text();
            console.error("Failed to create claim:", errorText);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: "Failed to create claim." }),
            };
        }
    } catch (error) {
        console.error("Error creating claim:", error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to create claim." }),
        };
    }
};
