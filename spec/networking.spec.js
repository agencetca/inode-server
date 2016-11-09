var request = require("request");

describe("Front-end <--> First Node relationship", function() {
    
    var base_url = "http://localhost:8080/"

    describe("GET /", function() {
        it("returns status code 200", function(done) {
            request.get(base_url, function(error, response, body) {
                expect(response.statusCode).toBe(200);
                done();
            });
        });
    });
});
